/**
 * Color para la salida de terminal. Se desactiva cuando la salida no es una
 * terminal o cuando NO_COLOR esta definido.
 */

const activo = process.stdout.isTTY === true && !process.env.NO_COLOR

function wrap(codigo: string) {
  return (s: string) => (activo ? `\u001b[${codigo}m${s}\u001b[0m` : s)
}

export const c = {
  reset: wrap('0'),
  neg: wrap('1'),
  ten: wrap('2'),
  gris: wrap('90'),
  rojo: wrap('31'),
  verde: wrap('32'),
  ambar: wrap('33'),
  azul: wrap('36'),
  morado: wrap('35'),
}

/** Quita los codigos de color, para escribir el log en texto plano. */
export function sinColor(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;]*m/g, '')
}

/** Colorea solo si la salida es terminal. */
export function pintar(codigo: (s: string) => string, s: string): string {
  return activo ? codigo(s) : s
}
