# Backfill de campos de búsqueda — Zalfro

Herramienta administrativa local, independiente de la aplicación y de Functions.
Esta etapa autoriza crear la herramienta y probarla localmente. **No autoriza
autenticar, ejecutar un dry-run real ni aplicar cambios a Firestore.** Los comandos
de acceso real de este documento quedan preparados para una autorización posterior.

## Alcance y garantías

- Proyecto obligatorio: `conectarsublimados-7881e`.
- Tenant obligatorio y único admitido: `elgol`.
- Base única: `(default)`. Colecciones únicas: `ventas` y `pedidos`.
- Los argumentos se validan antes de cargar Firebase o buscar credenciales.
- Modo predeterminado: **DRY-RUN**; no llama al camino de escritura ni crea logs,
  checkpoints u otros archivos. Imprime únicamente en la terminal.
- Apply exige `--apply`, `--confirm-tenant elgol`, `--max-updates N` y un directorio
  nuevo de ejecución o un checkpoint existente para reanudar.
- Solo completa los dos derivados indicados abajo. Nunca usa `set`, `delete`,
  transacciones, Functions, despliegues ni modificación de reglas o índices.
- Una página en memoria, escrituras secuenciales y reintentos limitados.
- No importa código de negocio de `src` ni de `functions`.

| Colección | Fuente | Único campo que puede actualizar |
| --- | --- | --- |
| ventas | clienteNombre | clienteNombreBusqueda |
| pedidos | cliente | clienteBusqueda |

La fuente debe ser **string con contenido**. El derivado debe estar ausente o ser
un string vacío/de espacios. El valor nuevo es `String(fuente).trim().toLowerCase()`.
No elimina acentos, no cambia espacios internos y no infiere nombres.

Un derivado no vacío nunca se reemplaza, aunque parezca incorrecto. Un derivado
de tipo inesperado (incluido `null`) se omite con anomalía. Una fuente ausente,
vacía o de otro tipo también se omite con anomalía. Cada documento se clasifica
una sola vez: tipo de destino inválido, fuente inválida, derivado existente o
candidato, en ese orden.

No cambia `clienteNombre`, `cliente`, `clienteId`, `createdAt`, `updatedAt`, fechas,
totales, pagos, movimientos, estados, producción, vendedor, sucursal ni relaciones
como `pedidoRefId`/`ventaRefId`. El metadato interno `updateTime` de Firestore sí
cambia naturalmente al escribir; no es el campo comercial `updatedAt`.

## Instalación y verificaciones locales

Requiere Node.js 22 o posterior y npm. Desde PowerShell:

```powershell
Set-Location 'C:\Users\MatiNuevo\Desktop\proyectos\conectar-sublima-app\tools\backfill-busqueda'
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run check
node backfill.cjs --help
```

Las pruebas usan adaptadores en memoria y un registro temporal bajo
`node_modules/.cache/backfill-tests`. No cargan Firebase, resuelven ADC ni acceden
a Firestore. El registro temporal se elimina al terminar cada prueba.

Dependencia directa fijada: `firebase-admin@13.10.0`. El lockfile fija también
`@google-cloud/firestore@7.11.6`. Se verificaron en el SDK instalado la firma de
`DocumentReference.update(data, precondition)` y la aceptación de
`{ lastUpdateTime: Timestamp }`. Se pasa `QueryDocumentSnapshot.updateTime`, el
Timestamp original del snapshot, no su representación JSON. El `WriteResult` que
devuelve el update expone por separado `writeTime`, usado solo para registrar el
resultado confirmado. Si cambia el SDK, volver a verificar ambos contratos.

## Autenticación — pendiente, no configurada en esta etapa

El CLI usa `applicationDefault()` de Firebase Admin, con proyecto y base explícitos.
No crea ni descarga claves, no ejecuta `gcloud` y no configura IAM.

Para una ejecución futura, un administrador deberá preparar ADC local para una
identidad autorizada. Preferir credenciales temporales mediante impersonación de
una cuenta de servicio si la organización ya dispone de ese acceso; ADC de usuario
autorizado es otra opción. Para el primer dry-run, preferir una identidad con solo
permisos de lectura. Apply necesitará permisos de lectura y actualización revisados
por el administrador. No usar una clave privada persistente como opción por defecto.

Firebase Admin usa IAM, no las reglas de seguridad del Client SDK. El filtro de
tenant y las validaciones del script son barreras de código: no equivalen a un
permiso IAM limitado a `elgol`. No se han comprobado las credenciales ni los permisos
reales. No alcanza con estar autenticado en la aplicación o en Firebase CLI.

Guardar cualquier credencial fuera del repositorio. Los archivos ignorados no están
cifrados; en Windows hay que proteger el directorio mediante permisos del usuario.
El CLI rechaza `FIRESTORE_EMULATOR_HOST` para evitar destinos ambiguos; las pruebas
actuales usan dobles, no un emulador.

Referencias oficiales: [ADC local](https://cloud.google.com/docs/authentication/set-up-adc-local-dev-environment),
[Firebase Admin](https://firebase.google.com/docs/admin/setup) y
[DocumentReference.update](https://cloud.google.com/nodejs/docs/reference/firestore/latest/firestore/documentreference).

## Futuro dry-run — requiere autorización aparte

Después de configurar y revisar la identidad, este comando recorre ambos conjuntos
del tenant, en páginas de hasta 100 documentos:

```powershell
node backfill.cjs --project conectarsublimados-7881e --tenant elgol --dry-run --page-size 100
```

Omitir `--dry-run` produce el mismo modo seguro. No añadir `--apply`.
Para acotar inicialmente el costo de lectura, añadir `--max-pages 1`: limita las
páginas **en total**, empezando por ventas, por lo que esa muestra puede no incluir
pedidos. Ese resultado se informa como incompleto.

El resumen incluye proyecto/base/tenant/modo, examinados y candidatos por colección,
omitidos por categoría, errores, cero escrituras y si terminó el recorrido.
Las anomalías muestran colección/ID y motivo sin imprimir el nombre del cliente.
Una consulta fallida detiene el recorrido y evita presentar resultados parciales
como completos. Las anomalías de datos son omisiones, no errores de infraestructura.

La consulta de cada página es:

```javascript
collection.where('clienteId', '==', 'elgol')
  .orderBy(FieldPath.documentId())
  .select('clienteId', campoFuente, campoDerivado)
  .limit(pageSize)
// En páginas siguientes: .startAfter(ultimoId)
```

No usa offset ni exige que exista el campo derivado para incluir un documento.
`--page-size` admite 1 a 500 (por defecto 100). Los documentos sin `clienteId`
correcto quedan fuera; no se adivina a qué tenant pertenecen.
No se crean índices. Si esta consulta falla por un índice, se detiene y habrá que
revisar la definición solicitada; los índices de búsqueda por nombre son consultas
distintas y no sustituyen esta comprobación pendiente en el entorno real.

Dry-run no guarda progreso en disco. Informa los últimos IDs procesados y admite
`--after-ventas ID` / `--after-pedidos ID` para continuar un diagnóstico parcial.
Los contadores de ese modo son solo los del segmento ejecutado; siempre indica
recorrido global incompleto al iniciar con cursor. Para obtener un diagnóstico
completo y actualizado hay que volver a comenzar sin cursores.

## Reconciliación aislada de un pending

`--reconcile-only` abre un checkpoint existente y consulta exclusivamente el
documento señalado por `pending`. No pagina, no continúa el backfill y el adaptador
de este modo solo expone lectura documental: no contiene operaciones `update`,
`set`, `create`, `delete`, batch ni transacción. Tampoco cambia reservas ni cursores.

Ejemplo para el primer piloto, sujeto a autorización separada de lectura real:

```powershell
node backfill.cjs --project conectarsublimados-7881e --tenant elgol --reconcile-only --resume "C:\Users\MatiNuevo\Desktop\proyectos\conectar-sublima-app\tools\backfill-busqueda\runs\elgol-piloto"
```

No admite `--apply`, `--dry-run`, `--max-updates`, cursores, tamaño/límite de páginas
ni opciones de conflicto. Obtiene el límite original del checkpoint y valida su
integridad antes de la lectura. Si no hay pending, informa esa condición sin leer
Firestore.

Para un documento existente valida colección, tenant, fuente, derivación esperada,
tipo y valor del campo derivado. Informa uno de estos estados:

- derivado con el valor esperado;
- derivado con otro valor;
- derivado ausente o vacío;
- documento eliminado;
- anomalía de tenant, fuente, derivación o tipo del destino.

Los cuatro primeros son observaciones inequívocas del estado leído: se agrega un
evento `reconcile-only`, se conserva la reserva, se incrementa el contador
conservador de resultado incierto y se limpia `pending`. Esto no atribuye la autoría
de un valor coincidente. En una anomalía se mantienen checkpoint y pending sin
cambios para revisión. El journal registra el `updateTime` observado como datos
simples solo para auditoría; nunca se reconstruye ni reutiliza como precondición.

El proceso termina inmediatamente después de informar el resultado. Una ejecución
posterior con `--resume` requiere autorización de escritura aparte. Si el derivado
seguía ausente, el recorrido normal podrá encontrarlo nuevamente y cualquier intento
nuevo consumirá una reserva adicional dentro del límite original.

## Futuro apply — requiere autorización explícita adicional

Ejemplo de piloto limitado a **cinco actualizaciones en total**, no cinco por lote:

```powershell
node backfill.cjs --project conectarsublimados-7881e --tenant elgol --apply --confirm-tenant elgol --max-updates 5 --page-size 5 --run-dir ./runs/elgol-piloto-001
```

El directorio debe ser nuevo. Los caminos relativos se resuelven desde el directorio
actual; ejecutar desde esta carpeta mantiene los registros bajo su `.gitignore`.
Nunca poner el directorio de ejecución en una carpeta pública o compartida.

Para cada candidato, se registra intención y versión leída antes de enviar un
`update` de un solo campo con precondición `lastUpdateTime`. Si otro proceso cambia
el documento, el intento falla; se releen tenant, fuente y destino antes de decidir
si reintentar. Por defecto hay hasta dos reintentos de conflicto después del intento
inicial (`--conflict-retries`, entre 0 y 5). Si persiste el conflicto, se detiene sin
avanzar el cursor de ese documento. Un documento eliminado nunca se recrea.

El límite se aplica conservadoramente a cada llamada de actualización enviada,
incluidos los conflictos y resultados inciertos. **Un conflicto no devuelve cupo**:
el SDK puede haber aplicado una escritura, perdido su respuesta y obtenido el
conflicto al reintentar internamente. Los reintentos internos usan la misma
precondición y no pueden modificar dos versiones distintas con ese mismo intento.
Por eso puede haber menos actualizaciones que el límite solicitado. Un error de red
no clasificado como conflicto detiene el proceso conservando la reserva pendiente.
El resumen separa éxitos confirmados, operaciones preparadas pendientes de
reconciliación e intentos sin éxito confirmable.

## Progreso y reanudación

Apply mantiene, solo en disco local:

- `checkpoint.json`: ámbito, versión, límite, cursores, contadores y operación pendiente.
- `journal.jsonl`: intención, resultado, valor anterior del derivado, valor propuesto
  y versiones. Contiene nombres normalizados/IDs: tratarlo como dato sensible.
- `run.lock`: evita dos procesos sobre el mismo directorio.

El checkpoint se reemplaza mediante archivo temporal y rename; las escrituras de
checkpoint y journal usan `fsync`. Usar disco local estable, no carpetas de red o
sincronizadas. No hay atomicidad distribuida entre disco local y Firestore.

Para continuar la misma ejecución después de una interrupción o límite de páginas:

```powershell
node backfill.cjs --project conectarsublimados-7881e --tenant elgol --apply --confirm-tenant elgol --max-updates 5 --page-size 5 --resume ./runs/elgol-piloto-001
```

El `max-updates` debe coincidir con el original: no se reinicia al reanudar.
Al agotarse, esta ejecución no recibe más cupo; otra ejecución con nuevo directorio
y otro presupuesto requiere revisión/autorización. No editar el checkpoint para
aumentar el límite. Se permiten otros tamaños de página, manteniendo el ámbito.

Ctrl+C solicita parada ordenada después de la operación en curso. Tras un cierre
forzado puede quedar `run.lock`: **no borrarlo automáticamente**. Primero verificar
que el proceso anterior terminó, respaldar journal/checkpoint y revisar operaciones
pendientes; solo entonces retirar manualmente el bloqueo local para reanudar.
El bloqueo es por directorio, no global: no ejecutar varios apply simultáneamente.

Si quedó una intención pendiente, la reanudación relee ese documento y conserva
su reserva de forma conservadora. Un valor coincidente no demuestra quién lo escribió;
se informa como resultado anterior incierto, no como éxito confirmado. El cursor
no se había adelantado, por lo que se reexamina sin pisar derivados existentes.
No reanudar con registros perdidos/corruptos sin revisión: aborta ante incompatibilidades.

Los contadores de apply son acumulados del checkpoint; los errores y páginas del
resumen corresponden a la invocación actual. Los contadores por documento se
consolidan al procesarlo sin error; el documento que causó una interrupción antes
de consolidarse se reexamina. `Escrituras realizadas (confirmadas)` no incluye
operaciones de resultado incierto. Consultar también reservas y journal.

Códigos de salida: `0` recorrido completo; `1` error/argumentos inválidos;
`2` recorrido parcial o interrumpido. Alcanzar `max-updates` no equivale a completar
el tenant. La idempotencia permite otra pasada desde el inicio: derivados no vacíos
quedan intactos.

## Validación futura y riesgos

1. Autorizar por separado ADC y primer dry-run. Revisar proyecto, tenant, contadores,
   anomalías, errores y recorrido completo antes de autorizar apply.
2. Conservar evidencia de los dos campos afectados y de campos comerciales en una
   muestra autorizada, incluido Pedido #1 si continúa siendo candidato.
3. Autorizar un piloto pequeño. Comparar su journal y los documentos: solo el
   derivado correspondiente debe haber cambiado, además del metadato updateTime.
4. Repetir dry-run autorizado: los éxitos del piloto ya no deben ser candidatos.
5. Probar búsqueda por nombre y asociación Venta #162 / Pedido #1 en Zalfro.
   Las relaciones no deben cambiar.

No existe una foto consistente de todo el tenant entre páginas. Altas/cambios con ID
anterior al cursor pueden quedar pendientes; una pasada final desde el inicio permite
detectarlos. Se requiere leer todos los documentos del tenant para verificar campos
ausentes; paginar limita memoria, no el total de lecturas facturables.

Las escrituras pueden activar listeners y Functions ya desplegadas. La herramienta
no modifica ni invoca Functions directamente; **antes de autorizar apply hay que
verificar los efectos de triggers existentes en el entorno real**. Sigue pendiente
el bug del listener de ventas que puede reemplazar páginas acumuladas.

Completar derivados no elimina los límites de resultados de las búsquedas, no agrega
búsqueda por subcadenas ni corrige nombres fuente o derivados existentes incorrectos.
No garantiza que una sola búsqueda muestre todo el historial si excede esos límites.

## Rollback

No incluye rollback automático ni código para borrar campos/documentos. Conservar
el journal permite diseñar una reversión por documento, bajo nueva autorización:
solo el campo derivado, solo si el valor y la versión actuales siguen correspondiendo
al cambio confirmado, sin tocar otros campos. Restaurar ausencia exige borrar ese
campo y **no está autorizado en esta etapa**. Los casos inciertos y los documentos
que cambiaron después requieren revisión individual; nunca revertirlos a ciegas.
