##historial reglas store 25-05-2026##

---

rules_version = '2';
service firebase.storage {
match /b/{bucket}/o {

    function signedIn() {
      return request.auth != null;
    }

    function userDocPath() {
      return /databases/(default)/documents/usuarios/$(request.auth.uid);
    }

    function hasProfile() {
      return signedIn() && firestore.exists(userDocPath());
    }

    function profile() {
      return firestore.get(userDocPath()).data;
    }

    function isSuperAdmin() {
      return hasProfile() && profile().rol == "superadmin";
    }

    function isAdmin() {
      return hasProfile() && profile().rol == "admin";
    }

    function sameTenant(clienteId) {
      return hasProfile()
        && profile().clienteId is string
        && profile().clienteId == clienteId;
    }

    function pedidoDocPath(pedidoId) {
      return /databases/(default)/documents/pedidos/$(pedidoId);
    }

    function pedidoExiste(pedidoId) {
      return firestore.exists(pedidoDocPath(pedidoId));
    }

    function pedidoClienteId(pedidoId) {
      return firestore.get(pedidoDocPath(pedidoId)).data.clienteId;
    }

    function puedeSubirAPedido(pedidoId) {
      return pedidoExiste(pedidoId) && (
        isSuperAdmin()
        || (
          sameTenant(pedidoClienteId(pedidoId))
          && (
            isAdmin()
            || profile().permisos.pedidos.editar == true
            || profile().permisos.pedidos.crear == true
            || profile().permisos.produccion.editarDetalle == true
          )
        )
      );
    }

    match /pedidos/{pedidoId}/productos/{fileName} {
      allow read: if signedIn();
      allow write: if puedeSubirAPedido(pedidoId);
    }

    match /productosBase/{productoId}/{allPaths=**} {
      allow read: if signedIn();
      allow write: if isSuperAdmin() || isAdmin();
    }

    match /{allPaths=**} {
      allow read, write: if false;
    }

}
}

---

historial rglas firestore ultimo cambio 25-05-2026

rules_version = '2';
service cloud.firestore {
match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function userRef() {
      return /databases/$(database)/documents/usuarios/$(request.auth.uid);
    }

    function hasProfile() {
      return signedIn() && exists(userRef());
    }

    function profile() {
      return get(userRef()).data;
    }

    function isSuperAdmin() {
      return hasProfile() && profile().rol == "superadmin";
    }

    function isAdmin() {
      return hasProfile() && profile().rol == "admin";
    }

    function isActiveUser() {
      return hasProfile() && profile().activo == true;
    }

    function hasClienteId() {
      return hasProfile()
        && profile().clienteId is string
        && profile().clienteId != "";
    }

    function sameTenant(clienteId) {
      return isActiveUser()
        && hasClienteId()
        && clienteId == profile().clienteId;
    }

    function tenantIsActiveById(clienteId) {
      return exists(/databases/$(database)/documents/clientes-saas/$(clienteId))
        && get(/databases/$(database)/documents/clientes-saas/$(clienteId)).data.estado == "activo";
    }

    function canReadTenantDoc(clienteId) {
      return isSuperAdmin() || sameTenant(clienteId);
    }

    function canCreateTenantDoc() {
      return isSuperAdmin()
        || (
          isAdmin()
          && isActiveUser()
          && request.resource.data.clienteId == profile().clienteId
          && tenantIsActiveById(profile().clienteId)
        );
    }

    function canUpdateTenantDoc() {
      return isSuperAdmin()
        || (
          isAdmin()
          && isActiveUser()
          && resource.data.clienteId == profile().clienteId
          && request.resource.data.clienteId == profile().clienteId
          && tenantIsActiveById(profile().clienteId)
        );
    }

    function canDeleteTenantDoc() {
      return isSuperAdmin()
        || (
          isAdmin()
          && isActiveUser()
          && resource.data.clienteId == profile().clienteId
          && tenantIsActiveById(profile().clienteId)
        );
    }

    function pedidoParentClienteId(pedidoId) {
      return get(/databases/$(database)/documents/pedidos/$(pedidoId)).data.clienteId;
    }

    function invitacionDocByToken(token) {
      return /databases/$(database)/documents/invitaciones_usuarios/$(token);
    }

    function invitacionValidaParaActivacion() {
      return request.auth != null
        && exists(/databases/$(database)/documents/invitaciones_usuarios/$(request.resource.data.invitacionId))
        && get(/databases/$(database)/documents/invitaciones_usuarios/$(request.resource.data.invitacionId)).data.estado == "pendiente"
        && get(/databases/$(database)/documents/invitaciones_usuarios/$(request.resource.data.invitacionId)).data.email == request.resource.data.email
        && get(/databases/$(database)/documents/invitaciones_usuarios/$(request.resource.data.invitacionId)).data.clienteId == request.resource.data.clienteId
        && get(/databases/$(database)/documents/invitaciones_usuarios/$(request.resource.data.invitacionId)).data.rol == request.resource.data.rol;
    }

    function puedeLeerInvitacion(clienteId) {
      return isSuperAdmin()
        || (
          isAdmin()
          && isActiveUser()
          && clienteId == profile().clienteId
        );
    }

    function puedeCrearInvitacion() {
      return isSuperAdmin()
        || (
          isAdmin()
          && isActiveUser()
          && request.resource.data.clienteId == profile().clienteId
          && tenantIsActiveById(profile().clienteId)
        );
    }

    function puedeActualizarInvitacion(clienteId) {
      return isSuperAdmin()
        || (
          isAdmin()
          && isActiveUser()
          && clienteId == profile().clienteId
          && tenantIsActiveById(profile().clienteId)
        );
    }

    function ventaParentClienteId(ventaId) {
      return get(/databases/$(database)/documents/ventas/$(ventaId)).data.clienteId;
    }

        function hasPermisos() {
      return hasProfile() && profile().permisos is map;
    }

    function permisosModuloExiste(modulo) {
      return hasPermisos() && profile().permisos[modulo] is map;
    }

    function permisoModuloAccion(modulo, accion) {
      return permisosModuloExiste(modulo)
        && profile().permisos[modulo][accion] == true;
    }

    function tenantUserBase(clienteId) {
      return sameTenant(clienteId)
        && isActiveUser()
        && tenantIsActiveById(clienteId);
    }

    function canModulo(clienteId, modulo, accion) {
      return isSuperAdmin()
        || (
          tenantUserBase(clienteId)
          && (
            isAdmin()
            || permisoModuloAccion(modulo, accion)
          )
        );
    }

    function changedKeys() {
      return request.resource.data.diff(resource.data).affectedKeys();
    }

    function onlyChangesAllowed(allowedKeys) {
      return changedKeys().hasOnly(allowedKeys);
    }

    function canReadClientes(clienteId) {
      return canModulo(clienteId, "clientes", "ver");
    }

    function canCreateClientes(clienteId) {
      return canModulo(clienteId, "clientes", "crear");
    }

    function canUpdateClientes(clienteId) {
      return canModulo(clienteId, "clientes", "editar");
    }

    function canDeleteClientes(clienteId) {
      return canModulo(clienteId, "clientes", "eliminar");
    }

    function canReadPedidos(clienteId) {
      return isSuperAdmin()
        || (
          tenantUserBase(clienteId)
          && (
            isAdmin()
            || permisoModuloAccion("pedidos", "ver")
            || permisoModuloAccion("produccion", "ver")
          )
        );
    }

    function canCreatePedidos(clienteId) {
      return canModulo(clienteId, "pedidos", "crear");
    }

    function canDeletePedidos(clienteId) {
      return canModulo(clienteId, "pedidos", "eliminar");
    }

    function canEditPedidoGeneral(clienteId) {
      return canModulo(clienteId, "pedidos", "editar");
    }

    function canMoverProduccion(clienteId) {
      return canModulo(clienteId, "produccion", "mover");
    }

    function canEditarDetalleProduccion(clienteId) {
      return canModulo(clienteId, "produccion", "editarDetalle");
    }

    function canAsignarUsuarioProduccion(clienteId) {
      return canModulo(clienteId, "produccion", "asignarUsuario");
    }

function canUpdatePedidoProduccion(clienteId) {
return canMoverProduccion(clienteId)
&& onlyChangesAllowed([
"columnaProduccionId",
"progresoProduccion",
"estadoProduccion",
"produccionFinalizada",
"estado",
"produccionActualizadoAt",
"updatedAt",
"ultimaAccionProduccionPor",
"ultimaAccionProduccionPorNombre",
"ultimaAccionProduccionAt"
]);
}

    function canUpdatePedidoDetalleProduccion(clienteId) {
      return canEditarDetalleProduccion(clienteId)
        && onlyChangesAllowed([
          "produccionNotaCorta",
          "produccionNotaLarga",
          "produccionMetros",

          "produccionImagenPortada",
          "produccionImagenPortadaOrigen",

          "produccionArchivos",

          "produccionEtiquetas",
          "produccionEtiquetaId",
          "produccionEtiquetaNombre",
          "produccionEtiquetaColor",

          "updatedAt"
        ]);
    }

    function canUpdatePedidoAsignacion(clienteId) {
      return canAsignarUsuarioProduccion(clienteId)
        && onlyChangesAllowed([
          "produccionAsignadoUid",
          "produccionAsignadoNombre",
          "produccionAsignadoEmail",
          "produccionAsignadoAt",
          "produccionAsignadoPorUid",
          "produccionAsignadoPorNombre",
          "updatedAt"
        ]);
    }

    function canUpdatePedidos(clienteId) {
      return isSuperAdmin()
        || (
          tenantUserBase(clienteId)
          && (
            isAdmin()
            || canEditPedidoGeneral(clienteId)
            || canUpdatePedidoProduccion(clienteId)
            || canUpdatePedidoDetalleProduccion(clienteId)
            || canUpdatePedidoAsignacion(clienteId)
          )
        );
    }

    function canReadProduccionColumnas(clienteId) {
      return isSuperAdmin()
        || (
          tenantUserBase(clienteId)
          && (
            isAdmin()
            || permisoModuloAccion("produccion", "ver")
            || permisoModuloAccion("pedidos", "ver")
          )
        );
    }

    function canManageProduccionColumnas(clienteId) {
      return isSuperAdmin()
        || (
          tenantUserBase(clienteId)
          && isAdmin()
        );
    }

    function canReadVentas(clienteId) {
      return canModulo(clienteId, "ventas", "ver");
    }

    function canCreateVentas(clienteId) {
      return canModulo(clienteId, "ventas", "crear");
    }

    function canUpdateVentas(clienteId) {
      return canModulo(clienteId, "ventas", "editar");
    }

    function canReadMovimientos(clienteId) {
      return isSuperAdmin()
        || (
          tenantUserBase(clienteId)
          && (
            isAdmin()
            || permisoModuloAccion("movimientos","ver")
            || permisoModuloAccion("ventas","ver")
            || permisoModuloAccion("caja","ver")
          )
        );
    }

    function canReadCaja(clienteId) {
      return canModulo(clienteId, "caja", "ver");
    }

    function canCreateCaja(clienteId) {
      return canModulo(clienteId, "caja", "crear");
    }

    function canUpdateCaja(clienteId) {
      return canModulo(clienteId, "caja", "editar");
    }

    function canCreateMovimientos(clienteId) {
      return isSuperAdmin()
        || (
          tenantUserBase(clienteId)
          && (
            isAdmin()
            || canCreateVentas(clienteId)
            || canUpdateVentas(clienteId)
            || canCreateCaja(clienteId)
            || canUpdateCaja(clienteId)
          )
        );
    }

    function canUpdateMovimientos(clienteId) {
      return isSuperAdmin()
        || (
          tenantUserBase(clienteId)
          && (
            isAdmin()
            || canCreateVentas(clienteId)
            || canUpdateVentas(clienteId)
            || canUpdateCaja(clienteId)
          )
        );
    }

        function canTouchUltimoNumeroVenta(clienteId) {
      return isSuperAdmin()
        || (
          tenantUserBase(clienteId)
          && (
            isAdmin()
            || permisoModuloAccion("ventas", "crear")
          )
        );
    }

    function canTouchUltimoNumeroPedido(clienteId) {
      return isSuperAdmin()
        || (
          tenantUserBase(clienteId)
          && (
            isAdmin()
            || permisoModuloAccion("pedidos", "crear")
          )
        );
    }

    // =========================
    // usuarios
    // =========================
    match /usuarios/{uid} {
    allow read: if isSuperAdmin()
      || (signedIn() && request.auth.uid == uid)
      || (
        isAdmin()
        && isActiveUser()
        && resource.data.clienteId == profile().clienteId
      )
      || (
        isActiveUser()
        && resource.data.clienteId == profile().clienteId
        && tenantIsActiveById(profile().clienteId)
        && permisoModuloAccion("produccion", "asignarUsuario")
      );

      allow create: if isSuperAdmin()
        || (
          signedIn()
          && request.auth.uid == uid
          && request.resource.data.activo == true
          && request.resource.data.clienteId is string
          && request.resource.data.clienteId != ""
          && (
            request.resource.data.rol == "admin"
            || (
              request.resource.data.rol == "usuario"
              && request.resource.data.invitacionId is string
              && request.resource.data.invitacionId != ""
              && invitacionValidaParaActivacion()
            )
          )
        );

      allow update: if isSuperAdmin()
        || (
          signedIn()
          && request.auth.uid == uid
          && resource.data.rol == request.resource.data.rol
          && resource.data.clienteId == request.resource.data.clienteId
        )
        || (
          isAdmin()
          && isActiveUser()
          && resource.data.clienteId == profile().clienteId
          && request.resource.data.clienteId == resource.data.clienteId
          && request.resource.data.rol == resource.data.rol
          && request.resource.data.email == resource.data.email
        );

      allow delete: if isSuperAdmin();
    }

    // =========================
    // clientes-saas
    // =========================
    match /clientes-saas/{clienteId} {
      allow read: if isSuperAdmin() || sameTenant(clienteId);

      allow update: if isSuperAdmin()
        || (
          isAdmin()
          && isActiveUser()
          && clienteId == profile().clienteId
        )
        || (
          canTouchUltimoNumeroVenta(clienteId)
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
            "ultimoNumeroVenta",
            "updatedAt"
          ])
        )
        || (
          canTouchUltimoNumeroPedido(clienteId)
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
            "ultimoNumeroPedido",
            "updatedAt"
          ])
        );

      allow create, delete: if isSuperAdmin();
    }


    // =========================
    // clientes-saas/{clienteId}/configuracion
    // =========================
    match /clientes-saas/{clienteId}/configuracion/{docId} {
      allow read: if isSuperAdmin()
        || (
          sameTenant(clienteId)
          && isActiveUser()
        );

      allow create, update: if isSuperAdmin()
        || (
          isAdmin()
          && isActiveUser()
          && clienteId == profile().clienteId
          && tenantIsActiveById(profile().clienteId)
        );

      allow delete: if isSuperAdmin();
    }

    // =========================
    // clientes-saas/{clienteId}/produccion_etiquetas
    // =========================
    match /clientes-saas/{clienteId}/produccion_etiquetas/{etiquetaId} {
      allow read: if isSuperAdmin()
        || (
          sameTenant(clienteId)
          && isActiveUser()
          && (
            isAdmin()
            || permisoModuloAccion("produccion", "ver")
            || permisoModuloAccion("pedidos", "ver")
          )
        );

      allow create: if isSuperAdmin()
        || (
          sameTenant(clienteId)
          && isActiveUser()
          && tenantIsActiveById(clienteId)
          && (
            isAdmin()
            || permisoModuloAccion("produccion", "editarDetalle")
          )
        );

      allow update: if isSuperAdmin()
        || (
          sameTenant(clienteId)
          && isActiveUser()
          && tenantIsActiveById(clienteId)
          && (
            isAdmin()
            || permisoModuloAccion("produccion", "editarDetalle")
          )
        );

      allow delete: if false;
    }


    // =========================
    // invitaciones_usuarios
    // =========================
    match /invitaciones_usuarios/{invitacionId} {
      // lectura directa por token para activar cuenta
      allow get: if (
          resource.data.token == invitacionId
          && resource.data.estado == "pendiente"
        )
        || isSuperAdmin()
        || (
          isAdmin()
          && isActiveUser()
          && resource.data.clienteId == profile().clienteId
        );

      // no permitir listar anónimamente
      allow list: if isSuperAdmin()
        || (
          isAdmin()
          && isActiveUser()
          && resource.data.clienteId == profile().clienteId
        );

      allow create: if puedeCrearInvitacion()
        && request.resource.data.clienteId is string
        && request.resource.data.clienteId != ""
        && request.resource.data.email is string
        && request.resource.data.email != ""
        && request.resource.data.nombre is string
        && request.resource.data.nombre != ""
        && request.resource.data.rol in ["admin", "usuario"]
        && request.resource.data.estado == "pendiente"
        && request.resource.data.token == invitacionId;

      allow update: if (
          puedeActualizarInvitacion(resource.data.clienteId)
          && request.resource.data.clienteId == resource.data.clienteId
          && request.resource.data.email == resource.data.email
          && request.resource.data.token == resource.data.token
          && request.resource.data.createdAt == resource.data.createdAt
        )
        || (
          request.auth != null
          && resource.data.estado == "pendiente"
          && request.resource.data.estado == "usada"
          && request.resource.data.email == resource.data.email
          && request.resource.data.clienteId == resource.data.clienteId
          && request.resource.data.token == resource.data.token
          && request.resource.data.createdAt == resource.data.createdAt
          && request.resource.data.usuarioCreadoUid == request.auth.uid
        );

      allow delete: if false;
    }

    // =========================
    // clientes
    // =========================
    match /clientes/{docId} {
      allow read: if canReadClientes(resource.data.clienteId);
      allow create: if canCreateClientes(request.resource.data.clienteId);
      allow update: if canUpdateClientes(resource.data.clienteId)
        && request.resource.data.clienteId == resource.data.clienteId;
      allow delete: if canDeleteClientes(resource.data.clienteId);
    }


    // =========================
    // pedidos
    // =========================
    match /pedidos/{pedidoId} {
      allow read: if canReadPedidos(resource.data.clienteId);

      allow create: if canCreatePedidos(request.resource.data.clienteId);

      allow update: if canUpdatePedidos(resource.data.clienteId)
        && request.resource.data.clienteId == resource.data.clienteId;

      allow delete: if canDeletePedidos(resource.data.clienteId);

      match /productos/{productoId} {
        allow read: if canReadPedidos(pedidoParentClienteId(pedidoId));

        allow create: if (
            canCreatePedidos(pedidoParentClienteId(pedidoId))
            || canEditPedidoGeneral(pedidoParentClienteId(pedidoId))
          )
          && request.resource.data.clienteId == pedidoParentClienteId(pedidoId);

        allow update: if canEditPedidoGeneral(pedidoParentClienteId(pedidoId))
          && request.resource.data.clienteId == pedidoParentClienteId(pedidoId);

        allow delete: if canEditPedidoGeneral(pedidoParentClienteId(pedidoId));
      }

        match /historial_produccion/{movimientoId} {
          allow read: if canReadPedidos(pedidoParentClienteId(pedidoId));

          allow create: if isSuperAdmin()
            || canMoverProduccion(pedidoParentClienteId(pedidoId))
            || canEditPedidoGeneral(pedidoParentClienteId(pedidoId))
            || canEditarDetalleProduccion(pedidoParentClienteId(pedidoId))
            || canAsignarUsuarioProduccion(pedidoParentClienteId(pedidoId));

          allow update, delete: if false;
        }
      }

    // =========================
    // productosBase
    // =========================
    match /productosBase/{productoId} {
      allow read: if canReadPedidos(resource.data.clienteId);
      allow create: if canCreatePedidos(request.resource.data.clienteId);
      allow update: if canEditPedidoGeneral(resource.data.clienteId)
        && request.resource.data.clienteId == resource.data.clienteId;
      allow delete: if canDeletePedidos(resource.data.clienteId);
    }

    // =========================
    // productos_config
    // =========================
    match /productos_config/{configId} {
      allow read: if canReadPedidos(resource.data.clienteId);
      allow create: if canCreatePedidos(request.resource.data.clienteId);
      allow update: if canEditPedidoGeneral(resource.data.clienteId)
        && request.resource.data.clienteId == resource.data.clienteId;
      allow delete: if canDeletePedidos(resource.data.clienteId);
    }



    // =========================
    // produccion_columnas
    // =========================
    match /produccion_columnas/{columnaId} {
      allow read: if canReadProduccionColumnas(resource.data.clienteId);

      allow create: if canManageProduccionColumnas(request.resource.data.clienteId);

      allow update: if canManageProduccionColumnas(resource.data.clienteId)
        && request.resource.data.clienteId == resource.data.clienteId;

      allow delete: if canManageProduccionColumnas(resource.data.clienteId);
    }


    // =========================
    // ventas
    // =========================
    match /ventas/{ventaId} {
      allow read: if canReadVentas(resource.data.clienteId);

      allow create: if canCreateVentas(request.resource.data.clienteId);

      allow update: if canUpdateVentas(resource.data.clienteId)
        && request.resource.data.clienteId == resource.data.clienteId;

      // por ahora NO permitimos borrar ventas
      allow delete: if false;

      // =========================
      // ventas/{ventaId}/items
      // =========================
      match /items/{itemId} {
        allow read: if canReadVentas(ventaParentClienteId(ventaId));

        allow create: if (
            canCreateVentas(ventaParentClienteId(ventaId))
            || canUpdateVentas(ventaParentClienteId(ventaId))
          )
          && request.resource.data.clienteId == ventaParentClienteId(ventaId);

        allow update: if canUpdateVentas(ventaParentClienteId(ventaId))
          && request.resource.data.clienteId == ventaParentClienteId(ventaId);

        // por ahora no borramos items directamente
        allow delete: if false;
      }

      // =========================
      // ventas/{ventaId}/pagos
      // =========================
      match /pagos/{pagoId} {
        allow read: if canReadVentas(ventaParentClienteId(ventaId));

        allow create: if (
            canCreateVentas(ventaParentClienteId(ventaId))
            || canUpdateVentas(ventaParentClienteId(ventaId))
          )
          && request.resource.data.clienteId == ventaParentClienteId(ventaId);

        allow update: if canUpdateVentas(ventaParentClienteId(ventaId))
          && request.resource.data.clienteId == ventaParentClienteId(ventaId);

        // por ahora no borramos pagos
        allow delete: if false;
      }
    }

    // =========================
    // cajas
    // =========================
    match /cajas/{cajaId} {
      allow read: if canReadCaja(resource.data.clienteId);

      allow create: if canCreateCaja(request.resource.data.clienteId);

      allow update: if canUpdateCaja(resource.data.clienteId)
        && request.resource.data.clienteId == resource.data.clienteId;

      allow delete: if false;
    }

    // =========================
    // historial_produccion - collectionGroup informes
    // =========================
    match /{path=**}/historial_produccion/{movimientoId} {
      allow read: if isSuperAdmin()
        || (
          isActiveUser()
          && resource.data.clienteId == profile().clienteId
          && tenantIsActiveById(profile().clienteId)
          && (
            isAdmin()
            || permisoModuloAccion("produccion", "ver")
            || permisoModuloAccion("pedidos", "ver")
          )
        );

      allow write: if false;
    }


    // =========================
    // movimientos
    // =========================
    match /movimientos/{movimientoId} {
      allow read: if canReadMovimientos(resource.data.clienteId);

      allow create: if canCreateMovimientos(request.resource.data.clienteId);

      allow update: if canUpdateMovimientos(resource.data.clienteId)
        && request.resource.data.clienteId == resource.data.clienteId;

      allow delete: if false;
    }


    // =========================
    // saas_pagos
    // =========================
    match /saas_pagos/{pagoId} {
      allow read: if isSuperAdmin();

      allow create: if isSuperAdmin()
        && request.resource.data.clienteSaasId is string
        && request.resource.data.clienteSaasId != "";

      allow update: if isSuperAdmin();

      allow delete: if false;
    }


    // =========================
    // fallback
    // =========================
    match /{document=**} {
      allow read, write: if false;
    }

}
}
