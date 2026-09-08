# Backfill de campos de búsqueda — Zalfro

Herramienta administrativa local, independiente de la aplicación y de Functions.
Esta etapa autoriza crear la herramienta y probarla localmente. **No autoriza
autenticar, ejecutar un dry-run real ni aplicar cambios a Firestore.** Los comandos
de acceso real de este documento quedan preparados para una autorización posterior.

## Alcance y garantías

- Proyecto obligatorio: `conectarsublimados-7881e`.
- Dry-run, apply y reconcile-only procesan exactamente un `--tenant` por ejecución.
  El inventario global no admite `--tenant` y nunca escribe.
- Base única: `(default)`. Colecciones únicas: `ventas` y `pedidos`.
- Los argumentos se validan antes de cargar Firebase o buscar credenciales.
- Modo predeterminado: **DRY-RUN**; no llama al camino de escritura ni crea logs,
  checkpoints u otros archivos. Imprime únicamente en la terminal.
- Apply exige `--apply`, una confirmación idéntica mediante `--confirm-tenant`,
  `--max-updates N` y un directorio individual nuevo o su checkpoint para reanudar.
- Antes de abrir el run-dir, apply relee el documento canónico del tenant y exige
  que exista, sea activo, no esté cancelado y no tenga una identidad inconsistente.
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

## Normalización cerrada de tres pagos históricos

`normalizar-pagos-minimo.cjs` está limitado en código al proyecto
`conectarsublimados-7881e`, a la venta `39iO7tiIMJa9k2X3K8Vw` de `elgol` y a los
tres pagos expresamente auditados. Su dry-run predeterminado relee la venta y los
pagos, muestra estado, cambio propuesto y precondiciones, y no escribe:

```powershell
node normalizar-pagos-minimo.cjs --project conectarsublimados-7881e
```

El modo de escritura queda preparado, pero requiere autorización posterior y la
confirmación literal `elgol:3-pagos-anulados`. Solo puede completar `ventaId` y
`estadoPagoRegistro`; antes de cada operación relee la venta y el pago en una
transacción y usa el `snapshot.updateTime` real como `lastUpdateTime`.

El pago `elgol3/ugBXc7nUUqkHlvkY7dl4/zrCmHAg2jRv3Ov1wQk8K` no está en el
allowlist y no debe normalizarse: tiene monto y venta total cero, sin evidencia
suficiente. Queda fuera del total futuro porque su `estadoPagoRegistro` no es
`activo`; no se le inventa monto, estado ni relación.

## Comparador read-only de Cobrado

`comparar-cobrado.cjs` compara, para un único tenant y período, el método histórico
de recorrido de ventas y pagos con la consulta preparada a `collectionGroup("pagos")`.
Ambos resultados informan cantidad de pagos activos y suma de `monto`; una diferencia
produce código de salida 2. El script pagina todas las lecturas, no posee opción de
escritura y no genera archivos locales.

```powershell
node comparar-cobrado.cjs --project conectarsublimados-7881e --tenant CLIENTE_ID --from 2026-09-03 --to 2026-09-03 --page-size 100
node comparar-cobrado.cjs --project conectarsublimados-7881e --tenant CLIENTE_ID --from 2026-08-28 --to 2026-09-03 --page-size 100
node comparar-cobrado.cjs --project conectarsublimados-7881e --tenant CLIENTE_ID --from 2026-08-05 --to 2026-09-03 --page-size 100
node comparar-cobrado.cjs --project conectarsublimados-7881e --tenant CLIENTE_ID --from FECHA_HISTORICA_DESDE --to FECHA_HISTORICA_HASTA --page-size 100
```

Son comandos preparados para ejecución manual posterior. El comparador nuevo exige
el índice de collection group y reglas compatibles; no activa el datasource del
dashboard.

## Inventario global de solo lectura — ejecución real pendiente de autorización

`--inventory-global` descubre tenants registrados y audita los campos derivados sin
crear ni modificar datos. Su fuente canónica es el document ID de `clientes-saas`;
un campo interno `clienteId` diferente se informa como anomalía de identidad y nunca
reemplaza ese ID.

Comando preparado para una autorización posterior de lectura real:

```powershell
node backfill.cjs --project conectarsublimados-7881e --inventory-global --page-size 100
```

Este modo no admite `--tenant`, `--dry-run`, `--apply`, `--reconcile-only`, cursores
manuales, límites de escritura, `--run-dir` ni `--resume`. No llama al estado del
backfill normal, no abre archivos locales y no contiene reservas o pending. Su
adaptador expone exclusivamente `pageTenants` y `pageCollection`; no expone update,
set, create, delete, batch ni transacciones.

Recorre secuencialmente y por document ID:

```javascript
db.collection('clientes-saas')
  .orderBy(FieldPath.documentId())
  .select('clienteId', 'nombreVisible', 'nombre', 'nombreCliente', 'estado', 'estadoSuscripcion')
  .limit(pageSize)

db.collection('ventas')
  .orderBy(FieldPath.documentId())
  .select('clienteId', 'clienteNombre', 'clienteNombreBusqueda')
  .limit(pageSize)

db.collection('pedidos')
  .orderBy(FieldPath.documentId())
  .select('clienteId', 'cliente', 'clienteBusqueda')
  .limit(pageSize)
// En páginas siguientes: .startAfter(ultimoDocumentId)
```

Solo conserva mapas de contadores por `clienteId`, no las colecciones completas.
Los IDs válidos presentes en ventas o pedidos que no estén registrados se agrupan
como tenants huérfanos. Los documentos con `clienteId` ausente, string vacío o tipo
inesperado se cuentan por separado y nunca se asignan a un tenant.

Para cada tenant registrado informa ID canónico, nombre existente (en orden
`nombreVisible`, `nombre`, `nombreCliente`), estado, estado de suscripción,
elegibilidad informativa, documentos examinados/candidatos, fuentes inválidas,
derivados de tipo inesperado y errores. La elegibilidad solo es verdadera si
`estado === "activo"`, `estadoSuscripcion !== "cancelado"` y no hay anomalía de
identidad. No habilita ninguna escritura.

El resumen global informa tenants por estado/elegibilidad, candidatos y examinados
por colección, huérfanos, IDs inválidos, anomalías, errores, horas de inicio/final y
completitud individual de los tres recorridos. Diferencia los candidatos de tenants
activos elegibles y los de tenants suspendidos/inactivos. Al final imprime
`TENANTS ACTIVOS CON CANDIDATOS`, ordenados por la suma de candidatos de mayor a
menor, con columnas de ID, nombre, ventas y pedidos. Los activos cancelados o con
identidad inconsistente no entran en esa lista operativa. Si falla una página, esa
colección queda incompleta, los totales se marcan no definitivos y el inventario
intenta leer las colecciones restantes para aportar diagnóstico.

El resultado siempre advierte que el recorrido paginado no es una snapshot
transaccional global: escrituras concurrentes pueden cambiar el universo durante la
lectura. Antes de una futura planificación de apply conviene repetir el inventario.
`elgol` se procesa como cualquier otro tenant; sus candidatos no se fuerzan a cero.
Los run-dir existentes bajo `runs/` no se abren ni se modifican.

## Orquestador multi-tenant local

`orchestrator.cjs` automatiza tenants elegibles sin incorporar un apply global. Tiene
dos fases separadas y procesa siempre un tenant por vez. No usa workers, promesas en
paralelo ni escrituras simultáneas. Las ejecuciones reales de ambas fases requieren
autorización operativa aparte.

### PREPARE: inventario y plan congelado

Desde este directorio, un comando futuro de preparación sería:

```powershell
node orchestrator.cjs `
  --project conectarsublimados-7881e `
  --prepare `
  --run-dir ./runs/multi-tenant-2026-09-01-001 `
  --page-size 100
```

PREPARE solo usa el inventario global de lectura. Exige cero errores, los tres
recorridos completos y totales definitivos. Selecciona documentos registrados de
`clientes-saas` que estén activos, sean elegibles, no estén cancelados, no tengan
anomalías de identidad y tengan candidatos. Huérfanos, IDs inválidos, suspendidos,
inactivos y documentos omitidos por clasificación nunca entran en el plan.

El directorio debe ser nuevo y estar debajo de `tools/backfill-busqueda/runs/`.
Genera `plan.json`, `manifest.json`, `state.json`, `summary.json`, journal global y
una carpeta por tenant. `plan.json` contiene proyecto, base, hora, cantidad, total de
candidatos y la lista ordenada. Su SHA-256 se calcula sobre una serialización estable
del contenido. EXECUTE no regenera el inventario ni modifica la lista congelada.

### EXECUTE: confirmación y límites

Después de revisar el plan, el comando futuro de ejecución sería:

```powershell
node orchestrator.cjs `
  --project conectarsublimados-7881e `
  --execute `
  --resume ./runs/multi-tenant-2026-09-01-001 `
  --confirm-plan HASH_SHA256_DE_PLAN_JSON `
  --max-updates-per-tenant 250 `
  --max-updates-total 3000 `
  --page-size 100
```

Los límites son obligatorios. Para cada tenant, el límite entregado al motor es
exactamente la suma de candidatos obtenida por su dry-run individual actual, sin
margen. Si supera el límite por tenant queda `NEEDS_REVIEW` sin escrituras. Antes de
autorizar un apply nuevo o reanudado también se comprueba conservadoramente que su
límite completo cabe en el presupuesto total. Las reservas acumuladas nunca pueden
superar `--max-updates-total`.

El flujo revalida el documento canónico, ejecuta dry-run completo, crea el run-dir
individual solo cuando corresponde, llama al motor actual con tenant y confirmación
idénticos, y ejecuta un dry-run final. `COMPLETED` exige cero candidatos, cero errores
y recorrido completo. El adaptador, checkpoint, reservas, pending y precondición
`lastUpdateTime` son los mismos del backfill individual.

Los nombres de las carpetas usan secuencia y un hash del ID; `tenant.json` conserva
la relación exacta. Cada subdirectorio `apply/` tiene checkpoint y journal propios.
El estado global nunca se usa como checkpoint de escritura.

### Errores y reanudación

Errores de elegibilidad, concurrencia, pending, checkpoint o lock individual se
detienen en ese tenant. Pending produce `NEEDS_RECONCILIATION` y no se reconcilia
automáticamente. Dos errores locales consecutivos de la misma clase detienen toda la
corrida. Credenciales, permisos, índices, red, disponibilidad, recursos, disco,
plan/hash, estado global, señal del operador y errores desconocidos son globales.

En resume se saltan `COMPLETED`, `ALREADY_COMPLETE`, `OMITTED`, `FAILED`,
`NEEDS_REVIEW` y `NEEDS_RECONCILIATION`. Lecturas interrumpidas pueden reiniciarse.
Un tenant `APPLYING` solo reanuda si su checkpoint corresponde al mismo tenant y
límite, no tiene pending y no conserva lock individual. Nunca se eliminan locks o
run-dir automáticamente.

`state.json` y `summary.json` se reemplazan mediante archivo temporal, `fsync` y
rename. El journal global es append-only. Un `run.lock` en la raíz impide dos EXECUTE
simultáneos. `summary.json` separa escrituras confirmadas, reservas, resultados
inciertos y pending, y agrupa completados, ya completos, omitidos y casos de revisión.

Todos esos archivos permanecen bajo `runs/`, ignorado por Git. Contienen IDs y datos
operativos: no deben copiarse a ubicaciones públicas ni agregarse al repositorio.

## Auditoría read-only de pagos de ventas

`auditoria-pagos.cjs` releva pagos embebidos, subcolecciones y movimientos
`cobro_venta`. No comparte ningún camino con apply, no crea archivos y su adaptador
solo expone lecturas paginadas. Los siguientes comandos requieren una autorización
operativa aparte para usar ADC y consultar el proyecto real:

```powershell
# Un tenant registrado
node auditoria-pagos.cjs --project conectarsublimados-7881e --tenant CLIENTE_ID --page-size 100

# Inventario global, incluidos tenants sin actividad y datos huérfanos
node auditoria-pagos.cjs --project conectarsublimados-7881e --inventory-global --page-size 100

# Los cuatro pagos problemáticos conocidos, sin escribir ni crear archivos
node auditoria-pagos.cjs --project conectarsublimados-7881e --inspect-known-payments --page-size 100
```

`--limit-details N` limita solo los casos anómalos impresos; nunca limita las
lecturas ni los totales. Cada colección y cada subcolección se pagina por document
ID. Si algún recorrido falla, se marca incompleto y los totales no se presentan
como definitivos.

Una relación pago/movimiento se considera segura solamente cuando `pagoRefId`
coincide con el ID del subdocumento, `origenRefId` coincide con la venta padre y el
tenant coincide. Monto, fecha y medio sirven únicamente para señalar posibles
correspondencias `AMBIGUO`. De igual manera, un pago embebido solo se considera
duplicado seguro si contiene un ID estable que coincide con la subcolección y sus
datos básicos son equivalentes.

Las clasificaciones describen casos auditados: `LISTO_PARA_COLLECTION_GROUP`,
`LEGACY_NORMALIZABLE`, `AMBIGUO`, `INCONSISTENTE` e `INVALIDO`. Un caso legacy solo
indica que los datos observados permiten proponer una normalización; esta herramienta
no implementa ni autoriza esa migración.

El modo `--inspect-known-payments` contiene una lista cerrada de cuatro paths. Lee
el pago completo, una vista acotada de su venta padre y los movimientos del mismo
tenant cuyo `origenRefId` coincide con la venta. Esto último no demuestra identidad:
solo `pagoRefId` igual al ID real del pago se considera una relación estable.

## Futuro dry-run — requiere autorización aparte

Después de configurar y revisar la identidad, este comando recorre ambos conjuntos
de un único tenant, en páginas de hasta 100 documentos:

```powershell
node backfill.cjs --project conectarsublimados-7881e --tenant CLIENTE_ID --dry-run --page-size 100
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
collection.where('clienteId', '==', 'CLIENTE_ID')
  .orderBy(FieldPath.documentId())
  .select('clienteId', campoFuente, campoDerivado)
  .limit(pageSize)
// En páginas siguientes: .startAfter(ultimoId)
```

No usa offset ni exige que exista el campo derivado para incluir un documento.
`--page-size` admite 1 a 500 (por defecto 100). Los documentos sin el `clienteId`
solicitado quedan fuera; no se adivina a qué tenant pertenecen. Dry-run admite
cualquier ID documental válido, pero no habilita apply ni demuestra por sí solo que
el tenant esté activo.
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
node backfill.cjs --project conectarsublimados-7881e --tenant CLIENTE_ID --reconcile-only --resume "C:\ruta\al\run-dir-del-tenant"
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

## Futuro apply individual — requiere autorización explícita adicional

No existe `--apply-global`. Cada ejecución exige un solo tenant y una confirmación
idéntica. Antes de crear o abrir el run-dir, el CLI consulta exclusivamente
`clientes-saas/{CLIENTE_ID}` y valida:

1. El documento existe y su document ID coincide exactamente.
2. Si contiene un campo interno `clienteId`, coincide con el document ID.
3. `estado === "activo"`.
4. `estadoSuscripcion !== "cancelado"`.
5. `--confirm-tenant` coincide exactamente con `--tenant`.

Un tenant huérfano, suspendido, inactivo, de estado desconocido, cancelado o con
identidad inconsistente aborta antes de abrir el registro local y antes de cualquier
escritura. Firebase Admin usa IAM, por lo que esta comprobación de código es una
barrera adicional obligatoria.

Ejemplo de piloto limitado a **cinco actualizaciones en total**, no cinco por lote:

```powershell
node backfill.cjs --project conectarsublimados-7881e --tenant CLIENTE_ID --apply --confirm-tenant CLIENTE_ID --max-updates 5 --page-size 5 --run-dir ./runs/CLIENTE_ID-piloto-001
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
node backfill.cjs --project conectarsublimados-7881e --tenant CLIENTE_ID --apply --confirm-tenant CLIENTE_ID --max-updates 5 --page-size 5 --resume ./runs/CLIENTE_ID-piloto-001
```

El `max-updates` y el tenant deben coincidir con el checkpoint original: no se
reinicia el límite y un run-dir nunca puede reanudarse para otro tenant.
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
