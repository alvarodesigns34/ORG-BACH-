# Bachillerato OS

Centro de control académico personal para 1.º de Bachillerato. Tareas, exámenes,
calendario, asignaturas y notas en un solo sitio, pensado para abrirlo cada mañana
y saber en diez segundos qué hay que hacer hoy y cómo va el curso.

No es una demo: todo lo que aparece en la interfaz funciona y todo lo que
introduces se guarda. Las secciones que aún no están construidas lo dicen
abiertamente en lugar de aparentar que funcionan.

## Poner en marcha

```bash
npm install
npm run dev      # desarrollo en http://localhost:5173
npm run build    # compila a dist/
npm run preview  # sirve lo compilado
npm run typecheck  # comprueba tipos (src y tests)
npm test           # pruebas (runner de Node, sin dependencias)
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
| 5 · Pulido | Microinteracciones, accesibilidad avanzada, optimización | Parcial |

Tras una auditoría externa se hizo una **ronda de endurecimiento**: se corrigió
el registro del inicio de las sesiones de estudio, se añadió validación campo a
campo de los datos importados y del temporizador guardado, se resolvió qué pasa
con los objetivos de una asignatura borrada, se arregló la entrada de decimales
en Ajustes, se hizo consistente la confirmación al borrar y se ajustó el
contraste de los textos secundarios en ambos temas.

Hay **214 pruebas** sobre el dominio, el reductor y la persistencia. Recorren
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

Cambiar `localStorage` por una base de datos con cuenta de usuario significa
reimplementar `load` y `save` en `src/storage/persistence.ts`. Nada más se entera.

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

## Datos

Se guardan en `localStorage` bajo la clave `bachillerato-os:v1`. Un curso entero
ocupa unas decenas de kilobytes, muy por debajo del límite del navegador.

- **Exportar/importar**: en Ajustes, en formato JSON legible. Sirve para cambiar
  de navegador o de ordenador sin perder nada.
- **Empezar de cero**: también en Ajustes, con confirmación.
- La aplicación arranca **completamente vacía**. En el alta puedes elegir
  asignaturas de un catálogo de 1.º de Bachillerato (LOMLOE) o escribir las tuyas.

## Sistema visual

- **Tipografía**: Newsreader (serif) para titulares y cifras académicas, Manrope
  para la interfaz. Auto-alojadas: la aplicación se ve igual sin conexión.
- **Color**: papel cálido y tinta negra cálida, nunca blanco ni negro puros. Un
  solo acento —azul tinta— y colores funcionales reservados para prioridad,
  estado y asignatura.
- **Accesibilidad**: contraste WCAG AA, navegación completa por teclado, foco
  visible, y ninguna información transmitida solo por color (la prioridad usa
  barras de altura creciente, el tipo de evento usa formas distintas).
- **Movimiento**: mínimo y funcional. Respeta `prefers-reduced-motion`.

## Atajos

| Tecla | Acción |
|---|---|
| `C` | Crear tarea desde cualquier sección |
| `Esc` | Cerrar el diálogo abierto |
| `↑` `↓` | Recorrer un menú contextual |
