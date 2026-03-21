La rama principal estable "main"

rama de mojoras "mejoras-sistema"


ejemplo de trabajo. Por cada mejora importante iniciar una nueva rama


Flujo correcto para vos ahora
Paso 1 — crear rama nueva

Desde tu proyecto:

git checkout -b mejoras-sistema

Eso crea la rama y te mueve ahí.

Ahora todo lo que hagas NO afecta main.

Paso 2 — trabajar normal

Programás como siempre:

git add .
git commit -m "mejoras productos"

Podés hacer varios commits.

Paso 3 — probar todo

Antes de pasar a producción:

npm start

Probás:

login
crear cliente
crear pedido
editar pedido
configuración

Cuando todo funciona:

recién ahí pasás a main.

Paso 4 — volver a main
git checkout main
Paso 5 — unir cambios
git merge mejoras-sistema

Eso pasa las mejoras a producción.

Paso 6 — subir
git push origin main
Paso 7 — deploy
npm run build
firebase deploy
Paso 8 — borrar rama (opcional)
git branch -d mejoras-sistema
Flujo completo visual

Trabajás:

main (producción estable)
   ↓
rama mejoras
   ↓
test
   ↓
merge main
   ↓
deploy
Qué pasa cuando terminás una mejora

Tenés 2 opciones:

Opción simple (te recomiendo esta)

Eliminar la rama y crear otra nueva para el siguiente bloque.

Ejemplo:

mejoras-productos
mejoras-dashboard
fix-clientes

Esto mantiene todo limpio.



