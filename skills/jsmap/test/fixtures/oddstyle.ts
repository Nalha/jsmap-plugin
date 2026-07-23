/**
 *    Oddly    spaced    doc    that    still    parses.
 */
export
function
spread
  <T>
  (
    first: number ,
    second : string ,
    ...rest : T[]
  )
  : string
{
  return join( first , second )
}


function join
(
  a: unknown
  , b: unknown /* trailing block comment */
)
: string { return `${a}${b}` }


export const chained =
  (
    value: number
  ): number =>
    value
      + 1
      - 2


class   Boxed
{
    constructor (
        readonly value : number ,
    ) {}

    map
    <U>
    (
        fn : ( n : number ) => U ,
    )
    : U
    {
        return fn( this.value )
    }
}


const registry =
{
    lookup ( key :
        string ) : number
    {
        return join( key , key ).length
    }
}
