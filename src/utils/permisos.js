export const PERMISOS_DEFAULT = {
  inicio:{ver:true},

  clientes:{
    ver:false,
    crear:false,
    editar:false,
    eliminar:false
  },

  pedidos:{
    ver:true,
    crear:false,
    editar:false,
    eliminar:false
  },

  produccion:{
    ver:true,
    mover:true,
    editarDetalle:true,
    asignarUsuario:false
  },

  ventas:{
    ver:false,
    crear:false,
    editar:false,
    eliminar:false
  },

  movimientos:{
    ver:false
  },

  configuracion:{
    ver:false
  }
};

export function puedeHacer(perfil, modulo, accion="ver"){

  if(!perfil) return false;

  if(perfil.rol==="admin" || perfil.rol==="superadmin"){
    return true;
  }

  const permisos=perfil.permisos || PERMISOS_DEFAULT;

  return permisos?.[modulo]?.[accion]===true;
}