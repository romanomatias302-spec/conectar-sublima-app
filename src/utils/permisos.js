export const PERMISOS_DEFAULT = {
inicio: {
  ver: true,

  verPedidos: true,
  verClientes: true,
  verIngresos: true,
  verProduccion: true,
  verAtrasados: true,
  verGrafico: true,
  verCuelloBotella: true,
},

  pedidos: {
    ver: true,
    crear: false,
    editar: false,
    eliminar: false,
  },

produccion: {
  ver: true,
  mover: true,
  editarDetalle: true,
  asignarUsuario: false,
  verSoloAsignados: false,

  gestionarColumnas: false,
  ordenManual: false,
},

   ventas: {
    ver: false,
    crear: false,
    editar: false,
    anular: false,
    listado: false,

    cotizaciones: false,
    crearCotizacion: false,
    editarCotizacion: false,
    convertirCotizacion: false,
    anularCotizacion: false,
  },

  caja: {
    ver: false,
    abrirCerrar: false,
    crearMovimiento: false,
    anularMovimiento: false,
    corregirApertura: false,
    historial: false,
  },

  gastos: {
    ver: false,
    verDetalle: false,
    crear: false,
    editar: false,
    anular: false,
  },

  informes: {
    ver: false,
  },

  movimientos: {
    ver: false,
  },

  configuracion: {
    ver: false,
  },
};

export function puedeHacer(perfil, modulo, accion="ver"){

  if(!perfil) return false;

  if(perfil.rol==="admin" || perfil.rol==="superadmin"){
    return true;
  }

  const permisos=perfil.permisos || PERMISOS_DEFAULT;

  return permisos?.[modulo]?.[accion]===true;
}