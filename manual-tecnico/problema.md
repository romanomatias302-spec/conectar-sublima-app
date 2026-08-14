### error de permisos al eliminar venta / no reglas ni usuarios
El cliente no podia eliminar la venta y descubrimos que no eran permisos ni perfil, era que tenia un pedido asociado y al eliminar la venta 
daba error, se soluciono modificando archivos. no se tocaron permisos.


### ERROR RESUELTO – LENTITUD EXTREMA EN PRODUCCIÓN
Problema detectado

Un cliente de México reportó que el módulo de Producción se congelaba completamente.

Síntomas observados:

El tablero tardaba entre 20 y 35 segundos en responder.
El mouse quedaba congelado.
El scroll no funcionaba.
Windows mostraba el mensaje "La página no responde".
Después de unos segundos el sistema volvía a funcionar normalmente.
El resto del sistema (Ventas, Pedidos, Caja, etc.) funcionaba correctamente.

Inicialmente se sospechó de:

cantidad de pedidos;
listeners de Firestore;
dnd-kit;
renderizado de tarjetas;
carga de imágenes.
Investigación realizada

Se probaron distintas optimizaciones:

eliminación temporal del measuring de dnd-kit;
optimización del render de imágenes;
incorporación de miniaturas (produccionImagenPortadaThumb);
migración automática mediante Cloud Function;
revisión de Firebase Storage;
análisis del rendimiento del navegador.

Ninguna de estas pruebas eliminó completamente el problema.

Causa real encontrada

Finalmente se detectó que un pedido contenía dos imágenes de aproximadamente 23 MB cada una.

Mientras que normalmente las imágenes del sistema pesan entre:

20 KB
50 KB
200 KB

estas imágenes eran cientos de veces más pesadas.

El navegador debía:

descargar la imagen;
decodificarla;
crear el bitmap;
renderizarla;
escalarla;
volver a calcular el layout.

Eso provocaba el congelamiento del hilo principal (Main Thread).

Incluso Firebase Console se ralentizaba al intentar visualizar dichas imágenes.

Solución aplicada

Se eliminaron únicamente esas imágenes pesadas desde Firebase Storage.

Inmediatamente:

Producción volvió a funcionar normalmente.
El detalle del pedido dejó de congelarse.
Desapareció el retraso del navegador.

Quedó confirmado que el origen era exclusivamente el tamaño excesivo de las imágenes.

Mejora implementada

Se incorporó el sistema de miniaturas para las portadas de Producción.

Nuevo comportamiento:

la tarjeta intenta utilizar produccionImagenPortadaThumb;
si existe, muestra la miniatura;
si no existe, utiliza la imagen original.

Además se desarrolló una Cloud Function que permite generar miniaturas para pedidos antiguos cuando sea necesario.

No es necesario ejecutar una migración masiva para todos los clientes.

Solo deberá utilizarse en casos puntuales de clientes antiguos.

Medidas preventivas

A partir de ahora el sistema deberá incorporar validaciones de tamaño máximo para todas las imágenes subidas.

Propuesta:

Portadas de Producción → máximo 2 MB.
Imágenes de productos/pedidos → máximo 5 MB.
Plantillas o imágenes de configuración → máximo 3 MB.
Archivos adjuntos (PDF, Excel, etc.) → límite independiente (por ejemplo 10 MB).



### action menu fuera de lugar

.sucursales-page .container-secundaria:hover {
transform: none !important;
}

con esto se soluciono actionmenu fuera de lugar

###

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
