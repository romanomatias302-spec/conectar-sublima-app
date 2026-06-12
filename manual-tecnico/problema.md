## problema pantalla en blanco al actualizar 11-06-2026

PROBLEMA IMPORTANTE RESUELTO

PANTALLA BLANCA AL HACER F5

Detectamos que el problema NO estaba en VentaDetalle ni PedidoDetalle.

El problema real era que:

App.js guardaba vistaActual.
Al refrescar se recuperaba la vista.
Pero NO se recuperaba el objeto seleccionado.

Ejemplo:

Antes del refresh:

vista = "venta-detalle"
ventaSeleccionada = {...}

Después del refresh:

vista = "venta-detalle"
ventaSeleccionada = null

Resultado:

La pantalla quedaba en blanco porque VentaDetalle dependía de ventaSeleccionada.

SOLUCIÓN IMPLEMENTADA (PATRÓN OFICIAL)

VENTAS

Se guarda:

localStorage("ventaDetalleId")

al abrir una venta.

En App.js existe:

recuperarVentaDetalle()

que:

verifica si vista === "venta-detalle"
verifica si falta ventaSeleccionada
recupera ventaDetalleId desde localStorage
consulta Firestore mediante obtenerVentaPorId()
reconstruye ventaSeleccionada

Si falla:

irAVista("ventas-listado")

PEDIDOS

Se implementó exactamente el mismo patrón.

Se guarda:

localStorage("pedidoDetalleId")

al abrir un pedido.

En App.js existe:

recuperarPedidoDetalle()

que:

verifica si vista === "detallePedido"
verifica si falta pedidoSeleccionado
recupera pedidoDetalleId desde localStorage
consulta Firestore
reconstruye pedidoSeleccionado

Si falla:

irAVista("pedidos")

REGLA IMPORTANTE PARA FUTURAS PANTALLAS

Si aparece un nuevo detalle:

detalle cliente
detalle producción
detalle caja
detalle proveedor
etc.

NO usar mensajes de error ni pantallas temporales.

Aplicar exactamente el mismo patrón:

guardar ID en localStorage
recuperar documento desde Firestore
reconstruir estado
si falla, volver al listado correspondiente

Ejemplo:

clienteDetalleId
produccionDetalleId
cajaDetalleId

Este es ahora el patrón oficial de navegación resiliente de Zalfro.

###
