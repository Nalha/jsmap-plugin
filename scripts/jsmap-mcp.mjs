#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const commands = ['api', 'search', 'callers', 'graph', 'extract', 'where'];
const cli = fileURLToPath(new URL('../skills/jsmap/jsmap.js', import.meta.url));

const tool = {
  name: 'jsmap',
  description: 'Inspect JavaScript APIs, call graphs, callers, matches, and individual functions without reading whole files.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', enum: commands },
      paths: { type: 'array', items: { type: 'string' }, minItems: 1 },
      argument: { type: 'string', description: 'Function name, regex, or line number when required by the command.' }
    },
    required: ['command', 'paths'],
    additionalProperties: false
  },
  annotations: { readOnlyHint: true, openWorldHint: false }
};

function call(args = {}, run = spawnSync) {
  if (!commands.includes(args.command) || !Array.isArray(args.paths) || !args.paths.length || args.paths.some((path) => typeof path !== 'string')) {
    return { content: [{ type: 'text', text: 'Invalid jsmap arguments.' }], isError: true };
  }
  const argv = [cli, args.command, ...args.paths, ...(args.argument === undefined ? [] : [String(args.argument)])];
  const result = run('node', argv, { cwd: process.cwd(), encoding: 'utf8' });
  const text = `${result.stdout || ''}${result.stderr || result.error?.message || ''}`.trim();
  return { content: [{ type: 'text', text }], ...(result.status === 0 ? {} : { isError: true }) };
}

function handle(request) {
  switch (request.method) {
    case 'initialize':
      return { protocolVersion: request.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'jsmap', version: '1.1.1' } };
    case 'ping': return {};
    case 'tools/list': return { tools: [tool] };
    case 'tools/call': return request.params?.name === 'jsmap'
      ? call(request.params.arguments)
      : { content: [{ type: 'text', text: `Unknown tool: ${request.params?.name}` }], isError: true };
    default: return undefined;
  }
}

if (process.argv.includes('--self-test')) {
  assert.equal(handle({ method: 'tools/list' }).tools[0].name, 'jsmap');
  const result = call({ command: 'api', paths: ['example.js'] }, (_command, args) => ({ status: 0, stdout: args.join(' '), stderr: '' }));
  assert.match(result.content[0].text, /jsmap\.js api example\.js$/);
  console.log('jsmap MCP self-test passed');
} else {
  const lines = createInterface({ input: process.stdin });
  lines.on('line', (line) => {
    let request;
    try { request = JSON.parse(line); } catch { return; }
    if (request.id === undefined) return;
    const result = handle(request);
    const response = result === undefined
      ? { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: `Method not found: ${request.method}` } }
      : { jsonrpc: '2.0', id: request.id, result };
    process.stdout.write(`${JSON.stringify(response)}\n`);
  });
}
