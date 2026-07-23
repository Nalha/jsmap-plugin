export
function
tangled
  (
    alpha ,
    beta
  )
{
  return glue( alpha , beta )
}

function glue ( x , y )
{ return String( x ) + String( y ) }

const looped = ( items ) =>
  items
    .map(
      ( item ) =>
        glue( item , item )
    )

class   Wrapped {
    static
    of
    (
        value
    ) {
        return new Wrapped()
    }
}
