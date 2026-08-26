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
npm run lint     # comprueba tipos (tsc --noEmit)
npm test         # pruebas del motor de notas (runner de Node, sin dependencias)
npm run check    # tipos + pruebas
```

## Estado por fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 · Fundación | Arquitectura, sistema visual, temas, navegación, responsive, persistencia, alta inicial | Hecha |
| 2 · Productividad | Tareas, subtareas, prioridades, calendario, exámenes, asignaturas | Hecha |
| 3 · Académico | Notas, categorías de peso, medias ponderadas, calculadora de nota, evaluaciones | Hecha |
| 4 · Análisis | Estadísticas, gráficos, sesiones de estudio, objetivos | Pendiente |
| 5 · Pulido | Microinteracciones, accesibilidad avanzada, optimización | Pendiente |

El motor de cálculo (`src/domain/grades.ts`) está cubierto por 55 pruebas que
recorren los casos que rompen este tipo de aplicaciones: pesos que no suman
100, escalas distintas del 10, categorías todavía sin evaluar y objetivos
imposibles.

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
│   └── palette.ts     Claves de color de asignatura
│
├── storage/       Persistencia. Único módulo que toca localStorage.
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
