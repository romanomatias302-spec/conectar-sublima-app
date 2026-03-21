Manual Técnico – Conectar Sublima SaaS

Versión: 1.0
Estado: Producción inicial
Arquitectura: Multi-tenant SaaS

1 – Descripción del sistema

Conectar Sublima SaaS es un sistema web desarrollado para gestionar pedidos, clientes y producción en negocios de sublimación e indumentaria personalizada.

El sistema permite que múltiples empresas utilicen la misma plataforma manteniendo sus datos aislados mediante arquitectura multi-tenant basada en clienteId.

El objetivo del sistema es centralizar:

• Gestión de clientes
• Gestión de pedidos
• Configuración dinámica de productos
• Flujo productivo
• Información comercial

2 – Stack tecnológico
Frontend

React
JavaScript
CSS
React Icons

Backend

Firebase Authentication
Firestore Database

Infraestructura

Firebase Hosting

Arquitectura

Single Page Application (SPA)

Multi-tenant basado en clienteId

Control de acceso por roles.

3 – Estructura del proyecto
Carpeta principal
src/

Contiene toda la lógica del sistema.

/modulos

Contiene los módulos funcionales principales.

Cada carpeta representa una sección del sistema.

/modulos/auth

Gestión de autenticación.

Login.js
Pantalla de login.

Responsabilidades:

• Login Firebase
• Validación usuario
• Redirección App

/modulos/clientes

Gestión de clientes finales.

Archivos:

ClientesList.js
Lista clientes del tenant.

ClienteForm.js
Alta y edición.

ClienteDetalle.js
Vista detallada cliente.

Responsabilidades:

CRUD clientes.

Todos los clientes deben guardar:

clienteId

para multi-tenant.

/modulos/pedidos

Gestión pedidos.

Archivos:

PedidosList.js
Lista pedidos.

PedidoDetalle.js
Detalle pedido.

PedidoFormModal.js
Alta pedido.

ProductoFormModal.js
Config producto dentro pedido.

Responsabilidades:

Gestión flujo productivo.

Cada pedido guarda:

clienteId

/modulos/configuracion

Configuración dinámica del sistema.

Archivos:

Configuracion.js
Pantalla configuración general.

ConfiguracionProductos.js
Lista productos configurables.

ConfiguracionProductoIndividual.js
Config producto.

Responsabilidades:

Permitir productos personalizables.

Ejemplo:

Remera
Taza
Gorra

Cada producto pertenece al tenant.

/modulos/inicio

Dashboard.

Archivo:

Inicio.js

Responsabilidades:

KPIs:

Clientes totales
Pedidos activos
Pedidos finalizados

/modulos/superadmin

Panel dueño SaaS.

Archivo:

DuenoSaasPanel.js

Responsabilidades:

Gestión tenants.

Clientes SaaS.

/comunes

Componentes reutilizables.

Sidebar.js

Navegación principal.

Responsabilidades:

• Navegación módulos
• Usuario logueado
• Logout

MobileMenu.js

Menú mobile.

ActionMenu.js

Menú acciones tabla.

Editar
Eliminar

/firebase

Configuración Firebase.

firebase.js

Inicializa:

Auth
Firestore

App.js

Archivo central aplicación.

Responsabilidades:

Auth listener
Carga perfil
Bloqueos acceso
Routing interno

Controla:

usuario
perfil
authLoading
mensajeBloqueo

4 – Modelo de datos Firestore
usuarios

Path:

usuarios/{uid}

Campos:

nombre
email
rol
clienteId
activo

Roles:

superadmin
admin

clientes-saas

Path:

clientes-saas/{clienteId}

clienteId es ID manual tipo slug.

Ejemplo:

urban
elgol

Campos:

nombre
nombreVisible
estado
logoUrl
plan
mantenimientoMensual

Estados:

activo
suspendido

clientes

Path:

clientes/{autoId}

Campos:

nombre
dni
telefono
clienteId

clienteId define tenant.

pedidos

Path:

pedidos/{autoId}

Campos:

id interno
cliente
clienteDNI
fechaPedido
fechaEntrega
estado
clienteId

Estados:

Pendiente
En proceso
Terminado
Cancelado

pedidos/productos

Path:

pedidos/{pedidoId}/productos/{productoId}

Campos:

producto
productoNombre
cantidad
zonas
talles
imagenes
clienteId
productosBase

Path:

productosBase/{autoId}

Campos:

nombre
tipo
clienteId
switches
zonas
talles
colores
atributosExtra
productos_config

Configuración avanzada producto.

Path:

productos_config/{autoId}
5 – Arquitectura multi-tenant

Sistema basado en:

clienteId

Cada documento debe tener:

clienteId

Regla fundamental:

Un usuario solo puede acceder datos donde:

clienteId == perfil.clienteId

6 – Seguridad Firestore

Reglas basadas en:

usuario activo
mismo tenant

READ permitido:

usuario activo
mismo clienteId

WRITE permitido:

usuario activo
tenant activo

7 – Control acceso App

App.js controla:

usuario activo
tenant activo

Bloqueos:

Usuario inactivo:

activo != true

Tenant suspendido:

estado = suspendido

8 – Flujo de deploy

Build:

npm run build

Deploy:

firebase deploy

Flujo recomendado:

crear branch
testear
merge main
deploy

9 – Problemas técnicos resueltos
Producto no cargaba al editar pedido

Problema:

Producto no aparecía hasta recargar configuración.

Causa probable:

Carga async productosBase.

Solución futura:

Esperar carga productos antes render.

Bloqueo incorrecto usuario

Problema:

Usuario activo bloqueado.

Causa:

Comparación estado estricta.

Solución:

Normalización string.

DNI como ID cliente

Problema:

Conflictos multi-tenant.

Solución:

AutoId Firestore.

DNI campo informativo.

10 – Decisiones técnicas
clienteId como base multi-tenant

Permite:

Aislar datos.

Escalar SaaS.

AutoID en clientes

Evita colisiones.

productosBase dinámicos

Permite escalar sistema a otros rubros.

11 – Roadmap técnico

Mejoras futuras:

Sistema planes SaaS
Trial automático
Pagos automáticos
Suspensión automática
Logs acciones
Backup export

12 – Buenas prácticas del proyecto

Nunca guardar datos sin clienteId.

Nunca modificar rules sin test.

Nunca deployar sin build.

Siempre testear:

login
crear pedido
editar pedido
clientes

13 – Estado actual del sistema

Estado:

Producción inicial funcional.

Módulos operativos:

Auth
Clientes
Pedidos
Productos
Configuración
Dashboard

Listo para:

Primeros clientes SaaS.

Próximos pasos técnicos recomendados

Sistema planes SaaS.

Panel billing.

Logs sistema.

Performance dashboard.

FIN DOCUMENTO