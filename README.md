# Bachillerato OS

Centro de control académico personal para 1.º de Bachillerato. Tareas, exámenes,
calendario, asignaturas y notas en un solo sitio, pensado para abrirlo cada mañana
y saber en diez segundos qué hay que hacer hoy y cómo va el curso.

No es una demo: todo lo que aparece en la interfaz funciona y todo lo que
introduces se guarda. Funciona sin conexión y sin cuenta; con cuenta, el curso
se sincroniza entre dispositivos y llega cada tarde un resumen por notificación.

## Poner en marcha

```bash
npm install
npm run dev      # desarrollo en http://localhost:5173
npm run build    # compila a dist/
npm run preview  # sirve lo compilado
npm run typecheck  # comprueba tipos (src y tests)
npm test           # pruebas (runner de Node, sin dependencias)
                   # incluye la fusión de la sincronización y el resumen diario
npm run check      # tipos + pruebas, lo mismo que ejecuta el despliegue
```

No hay linter configurado: lo que antes se llamaba `lint` era en realidad una
comprobación de tipos, y ahora se llama por lo que hace.

## Estado por fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 · Fundación | Arquitectura, sistema visual, temas, navegación, responsive, persistencia, alta inicial | Hecha |
| 2 · Productividad | Tareas, subtareas, prioridades, calendario, exámenes, asignaturas | Hecha |
| 3 · Académico | Notas, categorías de peso, medias ponderadas, calculadora de nota, evaluaciones | Hecha |
| 4 · Análisis | Estadísticas, gráficos, sesiones de estudio, objetivos | Hecha |
| 5 · Pulido | Microinteracciones, accesibilidad avanzada, optimización, instalable sin conexión | Hecha |
| 6 · Nube | Cuenta, sincronización sin conexión entre dispositivos, resumen diario push | Hecha |

Tras una auditoría externa se hizo una **ronda de endurecimiento**: se corrigió
el registro del inicio de las sesiones de estudio, se añadió validación campo a
campo de los datos importados y del temporizador guardado, se resolvió qué pasa
con los objetivos de una asignatura borrada, se arregló la entrada de decimales
en Ajustes, se hizo consistente la confirmación al borrar y se ajustó el
contraste de los textos secundarios en ambos temas.

Hay **263 pruebas** sobre el dominio, el reductor, la persistencia, la fusión
de la sincronización y el resumen diario. Recorren
los casos que rompen este tipo de aplicaciones: pesos que no suman 100, notas
sin peso junto a notas con peso, escalas distintas del 10, la nota del curso
frente al saco único de notas, la coma decimal española, un temporizador que no
se desvía en segundo plano ni al cambiar los ajustes a mitad de sesión, los
efectos en cadena de borrar o editar una asignatura, y archivos de importación
corruptos o ajenos.

No cubren la interfaz: no hay pruebas de componentes. Lo que se ha verificado de
la interfaz se ha hecho conduciendo la aplicación real en un navegador, no con
aserciones automatizadas, así que no protege contra regresiones futuras.

El dominio, el estado y la persistencia usan **rutas relativas con extensión**
en sus importaciones. No es un capricho: permite que Node los ejecute
directamente, y por eso las pruebas funcionan sin bundler ni loader. Las capas
de interfaz conservan el alias `@/`.

## Arquitectura

La regla que la sostiene: **la lógica de negocio no sabe que existe React.**

```
src/
├── domain/        Lógica pura. Sin React, sin DOM, sin estado.
│   ├── types.ts       Modelo de datos completo
│   ├── grades.ts      Medias ponderadas, calculadora, validación de pesos
│   ├── tasks.ts       Agrupación, orden, filtrado, progreso de subtareas
│   ├── alerts.ts      Detección de situaciones que merecen aviso
│   ├── dates.ts       Fechas en español, sin errores de zona horaria
│   ├── number.ts      Lectura de números con coma decimal
│   ├── study.ts       Temporizador y pomodoro
│   ├── stats.ts       Evolución, rankings y reparto del tiempo
│   ├── goals.ts       Progreso de objetivos
│   └── palette.ts     Claves de color de asignatura
│
├── sync/          Sincronización con Supabase (ver «Sincronización»).
│   ├── hlc.ts          Reloj lógico híbrido
│   ├── merge.ts        Fusión campo a campo: pura, con pruebas
│   ├── metaStore.ts    Relojes y cola de pendientes en localStorage
│   └── engine.ts       Red: sesión, subida, descarga, tiempo real
├── push/          Suscripción al resumen diario (Web Push)
├── storage/       Persistencia y validación de lo que entra.
│   ├── persistence.ts  Único módulo que toca localStorage
│   └── validate.ts     Revisión campo a campo de los datos importados
├── state/         Reductor, proveedor y selectores (datos derivados).
├── ui/            Componentes base sin conocimiento del dominio.
├── layout/        Armazón: barra lateral, navegación móvil, cabeceras.
├── features/      Componentes con lógica de negocio (editores, tarjetas).
├── views/         Una por sección de la navegación.
└── styles/        Tokens de diseño y utilidades.
```

La sincronización no sustituye a `localStorage`: se apoya en él. El curso se
sigue guardando en el dispositivo exactamente igual (mismo formato, misma
copia exportable) y la capa `sync/` trabaja aparte, observando los guardados.
El resto de la aplicación no sabe que existe la nube.

```
supabase/
├── migrations/     Esquema, RLS y funciones (tal como están aplicadas)
└── functions/
    └── daily-digest/   Edge Function del resumen diario (index.ts + digest.ts)
```

### Cómo se calculan las notas

Tres decisiones gobiernan todos los cálculos, y son las que evitan los errores
típicos de este tipo de aplicaciones:

1. **Cada nota se normaliza a la escala antes de ponderar.** Un 45/50 y un 9/10
   son la misma nota y pesan igual.

2. **La media se calcula sobre lo ya evaluado.** Una categoría sin notas todavía
   no participa: no arrastra la media a cero. Es la diferencia entre «llevas un
   8,4» y «llevas un 2,1 porque aún no has hecho el examen final».

3. **Los pesos incoherentes se avisan, no se corrigen en silencio.** Si las
   categorías suman 90 % o 110 %, se muestra una advertencia y se reparte
   proporcionalmente, pero el alumno lo ve y decide.

Cada asignatura define su propio reparto de categorías: no se asume que todas
evalúen igual.

**La calculadora** responde a las dos preguntas reales: «¿qué nota necesito en
lo que queda para llegar a mi objetivo?» y «si saco un 8,5 en el próximo
examen, ¿con qué media acabo?». Cuando el objetivo se sale de la escala lo dice
en vez de devolver un número imposible, e indica a cuánto se llegaría como
máximo.

### La coma decimal

En España se escribe «8,5», y `Number.parseFloat('8,5')` devuelve **8**: se
come el decimal en silencio. Por eso los campos numéricos no usan
`type="number"` —que además rechaza la coma en la mayoría de navegadores— sino
`type="text"` con `inputMode="decimal"`, y todo lo tecleado pasa por
`parseDecimal` (`src/domain/number.ts`).

### El temporizador

El estado guarda **marcas de tiempo**, no un contador que se incrementa. Un
contador con `setInterval` se retrasa en cuanto la pestaña pasa a segundo plano
—los navegadores lo estrangulan— y una sesión de 50 minutos acabaría
registrando 35. Con marcas de reloj no hay desvío, el intervalo solo repinta, y
recargar la página sin querer no pierde la sesión.

Los descansos no cuentan como estudio, y la sesión se registra con su hora de
**inicio**, para que caiga en el día en que se empezó aunque termine pasada la
medianoche.

### Los gráficos

Dibujados a mano en SVG, sin librería. Una regla los gobierna: **el color no
identifica nada**. La paleta de asignaturas está pensada para puntos pequeños
en una interfaz densa y no separa lo suficiente como para distinguir diez
series de un gráfico —lo confirma el validador de contraste—, así que cada
barra lleva su nombre escrito al lado y todas comparten tono, salvo cuando el
tono significa algo (aprobado, suspenso). Diez colores para diez barras ya
etiquetadas serían diez colores que no informan.

Cada gráfico incluye además una tabla equivalente para lectores de pantalla.

### Los datos que entran

Importar **sustituye todo** lo que había, así que un archivo con registros rotos
puede destruir un curso entero. Comprobar solo que existan las colecciones no
basta: un JSON puede ser sintácticamente correcto y traer notas sin escala o
sesiones de duración imposible que revientan la interfaz semanas después.

Por eso cada entidad se revisa campo a campo antes de entrar, y el criterio es
**descartar el registro roto, no el archivo entero**: de ciento veinte notas con
dos corruptas se recuperan ciento dieciocho, y se dice cuántas se quedaron
fuera. El mismo criterio se aplica al temporizador guardado.

### Los objetivos

El progreso sale de los datos reales; solo los de tipo «manual» se actualizan a
mano. Los de **nota media** muestran cuánto falta en lugar de un porcentaje:
decir que un 8,09 es «el 90 %» de un objetivo de 9 da a entender que se parte
de cero, cuando el punto de partida real es el aprobado.

## Limitaciones conocidas

Cosas decididas a conciencia, no olvidos:

- **Los periodos «esta evaluación» y «este curso» no tienen fechas.** La
  aplicación no sabe cuándo empieza ni termina un trimestre, así que los
  objetivos de horas y tareas con esos alcances cuentan todo lo acumulado. Los
  de nota sí distinguen correctamente evaluación y curso, porque las notas
  llevan su evaluación anotada. Resolverlo del todo pide guardar el calendario
  académico.
- **No hay separación entre cursos académicos.** `academicYear` es solo una
  etiqueta de configuración. Al pasar a 2.º habrá que decidir si se archivan
  los datos, se separan por curso o se empieza de cero exportando antes.
- **El catálogo de asignaturas del alta es genérico de LOMLOE**, sin distinguir
  optativas ni particularidades de cada comunidad autónoma.
- **El horario semanal no existe todavía.** El modelo guarda las franjas
  (`subject.schedule`) y la importación las valida, pero no hay ninguna pantalla
  para crearlas ni verlas: el campo llega siempre vacío. Se conserva en el tipo
  para no romper las copias que ya lo traigan.
- **El enlace entre un examen y su nota solo se crea al apuntar la nota** desde
  el propio examen. No hay forma de enlazar después una nota ya existente con un
  examen, ni de cambiar el enlace.
- **Las sesiones de estudio no se pueden editar**, solo crear desde el
  temporizador y borrar desde la lista.
- **Correo de la cuenta.** Mientras el proyecto de Supabase use su correo
  integrado, solo puede enviar (confirmación de cuenta, recuperar contraseña) a
  los miembros del equipo del proyecto y con un límite bajo por hora. Para más
  usuarios hace falta un SMTP propio (Resend, Brevo…).
- **Las subtareas se sincronizan como un solo campo**: si dos dispositivos
  editan subtareas distintas de la misma tarea sin conexión, gana la lista
  editada más tarde.

## Datos

Se guardan en `localStorage` bajo la clave `bachillerato-os:v1`. Un curso entero
ocupa unas decenas de kilobytes, muy por debajo del límite del navegador.

- **Exportar/importar**: en Ajustes, en formato JSON legible. Sirve para cambiar
  de navegador o de ordenador sin perder nada, con o sin cuenta.
- **Empezar de cero**: también en Ajustes, con confirmación. Con cuenta, borra
  también en la nube (el aviso lo dice).
- La aplicación arranca **completamente vacía**. En el alta puedes elegir
  asignaturas de un catálogo de 1.º de Bachillerato (LOMLOE), escribir las tuyas
  o **iniciar sesión** para recuperar el curso de otro dispositivo.

## Sincronización

Opcional: sin cuenta la aplicación funciona igual que siempre. Con cuenta
(correo y contraseña, en Ajustes) el curso está en todos tus dispositivos.

**Local primero.** Todo se guarda al instante en el dispositivo, con o sin red.
Cada cambio queda además en una cola persistente (`bachillerato-os:sync`) que se
sube en segundo plano: al recuperar la conexión, al volver a la app, cada pocos
minutos y nada más hacer un cambio. Cerrar la app con cambios pendientes no los
pierde: siguen en la cola. Un aviso en tiempo real de otro dispositivo dispara
la descarga en unos segundos.

**Sin pérdidas por conflictos.** Cada campo de cada registro lleva un reloj
lógico híbrido (HLC). Al fusionar gana, campo a campo, el más reciente:

- Si cambias el título de una tarea en el móvil y su fecha en el portátil, sin
  conexión, al sincronizar se conservan los dos cambios.
- Solo dos ediciones del **mismo** campo compiten, y gana la posterior. El HLC
  hace que «posterior» signifique «hecha después de ver la otra», aunque los
  relojes de los dispositivos no coincidan.
- Borrar es un campo más. Si un dispositivo borra una tarea mientras otro la
  sigue editando sin conexión, la edición la resucita en lugar de perderse.
- El servidor (`sync_push`) aplica las mismas reglas y es idempotente, así que
  el orden de llegada no cambia el resultado.

**Primera vez con cuenta.** Si la cuenta está vacía, este dispositivo la
inaugura con su curso. Si el dispositivo está vacío, descarga el de la cuenta.
Si hay datos en los dos, la aplicación pregunta: *combinar* (se suman; mandan
los ajustes de la cuenta) o *usar solo los de la cuenta* (antes descarga una
copia JSON de lo local). Nunca se elige en silencio.

**Seguridad.** Cada cuenta solo lee lo suyo (RLS sobre `auth.uid()`); nadie
puede escribir directamente en las tablas: las escrituras pasan por funciones
que validan forma, tamaño y relojes, y solo escriben en la cuenta autenticada.
El cliente usa la clave **publicable** de Supabase (pensada para ir en la app);
ninguna clave secreta está en el repositorio ni en el navegador. El tema
claro/oscuro no se sincroniza: es de cada dispositivo.

**Cerrar sesión** deja los datos en el dispositivo (y sigue anotando cambios
para subirlos al volver a entrar con la misma cuenta); hay una casilla para
borrarlos en un ordenador compartido. **Eliminar cuenta** borra la cuenta y todo
lo guardado en la nube, y conserva lo local (requiere aplicar la migración
`supabase/migrations/20261102150000_delete_my_account.sql`; hasta entonces el
botón muestra un error y no borra nada).

**Cómo se ha verificado.** Además de las pruebas de `tests/sync.test.ts` (dos
dispositivos y un servidor simulados), la sincronización se probó contra el
proyecto real con tres navegadores: vincular una cuenta con datos locales,
recuperar el curso en un dispositivo nuevo, recibir en tiempo real (≈4 s),
editar sin conexión en dos dispositivos y fusionar al volver la red, combinar
dos cursos y propagar borrados. La función `sync_push` y las políticas RLS se
probaron también directamente en SQL.

## Resumen diario (notificaciones)

Cada día a las **17:00, hora peninsular española**, una notificación con las
tareas pendientes de hoy (y las atrasadas) y los exámenes de los próximos días.
Llega con la aplicación cerrada: lo envía el servidor, no un temporizador del
navegador.

- **Voluntario.** No se pide permiso hasta activar el interruptor en Ajustes →
  Resumen diario. Cada dispositivo tiene el suyo y su propia hora (06:00–23:00),
  y hay un botón para enviar una prueba.
- **Cambio de hora.** `pg_cron` llama cada hora en punto a la Edge Function
  `daily-digest`, que calcula la hora local de cada suscripción con la base de
  datos de zonas horarias (`Europe/Madrid`). Así sale a las 17:00 tanto en
  invierno (16:00 UTC) como en verano (15:00 UTC) sin tocar nada; hay pruebas
  del propio día del cambio. Un envío por día como máximo, aunque se solapen dos
  ejecuciones, y con margen de dos horas si una ejecución se retrasa.
- **Sin ruido.** Si no hay nada pendiente ni exámenes cerca, no se envía.
- **Requiere cuenta**, porque el resumen se calcula con los datos sincronizados.
- **iPhone/iPad**: Apple solo permite notificaciones web a apps instaladas en la
  pantalla de inicio (iOS 16.4 o posterior). Ajustes lo explica si hace falta.
- Las claves VAPID y el secreto del cron se generan dentro de la base de datos
  (esquema `private`, no expuesto por la API): no pasan por el repositorio.

## Asistente de voz (IA)

Le dices lo que quieres apuntar y la app lo hace: «añade repasar el tema 4 para
hoy», «examen de Biología el jueves», «he sacado un 8 en el examen de Física,
vale un 40 % de la primera evaluación», «he estudiado una hora de Historia».
También se puede escribir. Está en el micrófono de la barra superior, en la
barra «Dime qué apuntar…» de Inicio y en el menú lateral.

- **Modelo**: Gemini (`gemini-3.8-flash`, con `gemini-3.5-flash-lite` de
  reserva si se agota la cuota). Ambos tienen plan gratuito en la API de Google;
  en ese plan, Google puede usar lo enviado para mejorar sus productos.
- **La IA no toca tus datos.** Devuelve acciones estructuradas y la app las
  valida y aplica con su propia lógica (`src/assistant/actions.ts`, con
  pruebas): lo que crea la IA es igual que lo que creas a mano, se sincroniza
  igual y se deshace de golpe con «Deshacer». Lo dudoso (una asignatura que no
  existe, una nota mayor que el máximo, un examen sin fecha) se descarta con
  un aviso en lugar de inventarse.
- **Voz**: se graba el audio y Gemini lo entiende directamente, sin
  transcriptor aparte; funciona en iPhone (MP4/AAC) y en Chrome (WebM/Opus).
- **Servidor**: la Edge Function `assistant` exige sesión, cuenta un máximo de
  150 peticiones diarias por usuario y guarda la clave en el secreto
  `GEMINI_API_KEY` de Supabase, nunca en la app ni en el repositorio.
- Al modelo solo viaja lo necesario: la frase o el audio, la fecha de hoy, tus
  asignaturas, tus tareas abiertas y los exámenes sin nota.

## Aplicación instalable (PWA)

Se puede instalar en la pantalla de inicio del móvil, del iPad o como
aplicación de escritorio, y sigue funcionando sin conexión.

- **Cómo se instala**: en Chrome/Edge (Android, escritorio) aparece un icono de
  instalar en la barra de direcciones; en Safari (iPhone/iPad), «Compartir → Añadir
  a pantalla de inicio».
- **Sin conexión**: [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) genera
  el manifest y el Service Worker en cada build — no están escritos a mano.
  Precachea el HTML, el JS y el CSS; con eso basta, porque los datos viven en
  `localStorage` y la nube solo es una copia sincronizada.
- **Avisos push**: el Service Worker generado importa `public/push-sw.js`, que
  muestra el resumen diario y, al tocarlo, abre o enfoca la aplicación.
- **Actualizaciones**: `registerType: 'autoUpdate'`. Al publicar una versión
  nueva, la siguiente vez que se abra la aplicación con conexión se actualiza
  sola, sin que el alumno tenga que hacer nada.
- Los iconos (`public/pwa-*.png`, `public/apple-touch-icon.png`) están
  generados a partir de `public/icono.svg`; si el icono cambia, hay que
  regenerarlos a mano — no se derivan automáticamente en el build.

## Sistema visual

Inspirado en las apps de Apple: claro, tranquilo y con el contenido delante.

- **Tipografía del sistema**: SF Pro en iPhone, iPad y Mac (SF Pro Rounded para
  las cifras), Segoe en Windows, Roboto en Android. Sin descargas de fuentes.
- **Color**: fondo agrupado gris claro (negro puro en oscuro, ideal en OLED),
  tarjetas sin borde y un solo azul de acento. El azul y los grises de texto se
  han oscurecido respecto a los de iOS para pasar **WCAG AA** sobre cualquier
  fondo en que aparecen.
- **Navegación como en iOS**: barra de pestañas de lado a lado con material
  translúcido (Inicio, Tareas, Calendario, Notas y Más). Al tocarla, el
  indicador se convierte en una lente de cristal que sigue al dedo, aumenta lo
  que tiene debajo y se asienta con un muelle en la pestaña elegida. Crear
  («+») y Ajustes (el avatar con tu inicial) están arriba a la derecha, en la
  barra superior, como en la App Store o Salud; en escritorio, Ajustes está en
  el pie del menú lateral. Son enlaces reales (teclado y lectores de pantalla).
- **Listas agrupadas**: títulos de sección fuera de las tarjetas, separadores
  que empiezan donde empieza el texto y filas con icono de color. Ajustes es
  una lista como la de iOS, con valores e interruptores en cada fila.
- **Calendario** con la vista de mes de iOS: números limpios, puntos de color
  (con forma distinta para los exámenes) y la agenda del día debajo.
- **Títulos grandes** que se resumen en la barra superior al desplazarse, y
  botón «‹ Atrás» en las fichas; **hojas** modales con tirador, que se cierran
  arrastrando.
- **Movimiento**: muelles amortiguados (`linear()`), solo `transform` y
  `opacity`. Con «reducir movimiento» no hay animaciones; con «reducir
  transparencia» el cristal pasa a ser opaco.
- **Microinteracciones**: los botones se hunden bajo el dedo, la casilla de
  tarea se dibuja al completarla, el interruptor se estira al pulsarlo.
- **Deshacer en lugar de confirmar**: borrar o completar una tarea ocurre al
  instante, con unos segundos para deshacerlo.
- **Accesibilidad**: navegación completa por teclado, foco visible, zonas
  táctiles de 44 px y ninguna información solo por color.

## Atajos

| Tecla | Acción |
|---|---|
| `C` | Crear tarea desde cualquier sección |
| `Esc` | Cerrar el diálogo abierto |
| `↑` `↓` | Recorrer un menú contextual |
