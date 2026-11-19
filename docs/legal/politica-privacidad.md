# Política de privacidad de Órbita

**Última actualización:** [FECHA DE PUBLICACIÓN] · Versión 2026-11-borrador-1

## En pocas palabras

- Órbita funciona **sin cuenta y sin conexión**: tus tareas, exámenes, notas y ajustes viven en **tu dispositivo**. Si no creas cuenta, no recibimos nada de ello.
- Si **creas una cuenta**, tu curso (asignaturas, tareas, exámenes, notas, eventos, horario, objetivos y sesiones de estudio) se **sincroniza con nuestro servidor** para que lo tengas en todos tus dispositivos. **Este contenido no está cifrado de extremo a extremo**: nuestro proveedor de base de datos lo guarda y nosotros podríamos verlo técnicamente, aunque no lo miramos salvo para resolver un fallo que nos pidas arreglar.
- El **asistente con IA** (opcional) envía tu mensaje, tu conversación reciente y un resumen de tu curso a **Mistral AI** (Francia) para responderte. Si usas la voz, también se envía el audio para transcribirlo.
- No hay publicidad, ni analítica de terceros, ni cookies de seguimiento, y no vendemos ni cedemos tus datos.
- Puedes **exportar tus datos y borrar tu cuenta** desde la app, cuando quieras.

## 1. Quién es el responsable

| | |
|---|---|
| Responsable | Órbita (España) |
| Correo de contacto (también para privacidad) | [CORREO_CONTACTO] |
| Web | [DOMINIO] |

No hay delegado de protección de datos: no es obligatorio para este servicio (art. 37 RGPD).

## 2. Qué datos tratamos

### 2.1 Sin cuenta
Nada sale de tu dispositivo, salvo lo que se explica en los apartados 2.4 y 4.2 (mapa del modo Estudio y archivos de la propia app).

### 2.2 Con cuenta

| Dato | Para qué |
|---|---|
| Correo electrónico y contraseña (la contraseña se guarda protegida por nuestro proveedor de cuentas, nunca en claro) | Crear y proteger tu cuenta, recuperar el acceso y avisarte de cosas importantes |
| Fechas de alta y de último acceso | Funcionamiento y seguridad |
| **Tu curso**: asignaturas, tareas y subtareas, exámenes, notas, eventos, horario, objetivos, ajustes de la app y registro de tus sesiones de estudio (vuelos: duración, destino, asignatura) | Sincronizarlo entre tus dispositivos y calcular el resumen diario y los avisos |
| Suscripción de notificaciones (dirección técnica que da tu navegador o dispositivo para avisarte, y su clave de cifrado) | Enviarte avisos que tú actives: resumen diario y avisos de vuelo |
| Preferencias de avisos y vuelos programados (hora de aterrizaje y escalas) | Enviar el aviso en el momento adecuado |
| Número de mensajes que envías al asistente cada día | Aplicar los límites de uso del asistente |
| Tu plan (gratuito o Premium), cómo lo obtuviste (por ejemplo, con un código) y hasta cuándo dura | Darte las funciones de tu plan |
| Si canjeas un código: la huella del código (no el código), cuándo y tus intentos de la última hora | Que cada código se use una sola vez y evitar abusos |
| Dirección IP y datos del navegador en los registros técnicos de nuestros proveedores | Seguridad y resolución de fallos |

### 2.3 Asistente con IA (opcional)
Al usarlo, se envía a nuestro servidor y de ahí a **Mistral AI**:
- tu mensaje (escrito o, si usas la voz, el audio que grabas, que se transcribe en Mistral);
- los últimos mensajes de la conversación (hasta 16; la conversación se reinicia tras 15 minutos sin escribir);
- un **resumen de tu curso** (asignaturas, tareas, exámenes, notas, eventos y estudio) para poder responder y actuar sobre él.

Nuestro servidor **no guarda** la conversación; solo cuenta cuántos mensajes envías al día (apartado 5). Mistral puede conservar los datos el tiempo mínimo que indiquen sus condiciones para prestar el servicio y detectar abusos. Las respuestas pueden contener errores: revisa siempre lo que el asistente crea o cambia (cada respuesta tiene «Deshacer»).

### 2.4 Mapa del modo Estudio
El mapa y el globo se cargan directamente desde **OpenFreeMap** (con datos de OpenStreetMap), que recibe la dirección IP de tu dispositivo y las zonas del mapa que miras. No recibe tu cuenta ni tus datos de estudio. Si prefieres evitarlo, puedes no usar el modo Estudio.

### 2.5 Lo que se queda solo en tu dispositivo
- Todo tu curso, tus ajustes, tus copias de seguridad automáticas (hasta 12) y la conversación reciente con el asistente.
- Las rutas, aeropuertos y sonidos del modo Estudio.

## 3. Para qué y con qué base jurídica

| Finalidad | Base jurídica (RGPD) |
|---|---|
| Prestar el servicio: cuenta, sincronización, resumen diario, avisos, planes y códigos | Ejecución del contrato que aceptas al registrarte (art. 6.1.b) |
| Seguridad: prevenir abusos, registros técnicos, límites del asistente | Interés legítimo en mantener el servicio seguro y su coste bajo control (art. 6.1.f) |
| Avisos sobre tu cuenta, cambios de estos textos o incidentes | Ejecución del contrato y, en incidentes, obligación legal (art. 6.1.b y 6.1.c) |
| Notificaciones push | Tu **consentimiento** al activarlas (art. 6.1.a); puedes retirarlo en Ajustes o en tu dispositivo |
| Asistente con IA | Ejecución del contrato: es una función que pides al usarla (art. 6.1.b) |

No tomamos decisiones automatizadas con efectos jurídicos sobre ti ni hacemos perfiles. No enviamos publicidad.

## 4. Quién más interviene

### 4.1 Proveedores que tratan datos por encargo nuestro (art. 28 RGPD)

| Proveedor | Qué hace | Dónde | Garantías |
|---|---|---|---|
| **Supabase** (Supabase, Inc., EE. UU.) | Cuentas, base de datos (tu curso sincronizado, suscripciones de notificaciones) y funciones del servidor | Región del proyecto: **UE (París, Francia)** | Contrato de encargo (DPA) con cláusulas contractuales tipo de la Comisión Europea |
| **Mistral AI** (Francia) | Genera las respuestas del asistente y transcribe la voz | UE | Contrato de encargo (DPA). |
| **GitHub Pages** (GitHub, Inc., EE. UU.) | Aloja la web y la app (archivos de la aplicación, sin tus datos) | Red mundial | Marco de Privacidad de Datos UE-EE. UU. |

### 4.2 Terceros que reciben datos sin ser encargados nuestros

| Tercero | Cuándo | Qué recibe |
|---|---|---|
| **OpenFreeMap / OpenStreetMap** | Al usar el mapa o el globo del modo Estudio | Tu IP y las zonas del mapa que cargas |
| **Servicio de notificaciones push de tu navegador** (Apple, Google, Mozilla…) | Si activas avisos | Un mensaje cifrado dirigido a tu dispositivo |

### 4.3 Nadie más
No cedemos datos a terceros salvo obligación legal (por ejemplo, un requerimiento judicial).

## 5. Cuánto tiempo se conservan

| Dato | Plazo |
|---|---|
| Datos de la cuenta y tu curso sincronizado | Mientras tengas la cuenta. Al borrarla se eliminan en el momento |
| Suscripciones de notificaciones y vuelos programados | Mientras la cuenta exista o hasta que desactives los avisos; los vuelos programados se eliminan cuando ya no hacen falta |
| Contador de mensajes del asistente | Se conserva con la cuenta (solo fecha y número) |
| Conversación con el asistente | No se guarda en nuestro servidor; Mistral, según sus condiciones |
| Intentos de canje de códigos | Se borran al día siguiente |
| Registros técnicos de nuestros proveedores | Los plazos cortos que fijan ellos |
| Copias de seguridad del servidor | Con el plan actual de nuestro proveedor no hay copias automáticas en el servidor: conviene que hagas tus propias copias desde la app (Ajustes → Exportar copia) |

Si hubiera una reclamación u obligación legal concreta, los datos necesarios se conservarían **bloqueados** solo el tiempo que exija (art. 32 LOPDGDD).

## 6. Almacenamiento en tu dispositivo y cookies

Órbita **no usa cookies** ni herramientas de analítica o publicidad. Usa el almacenamiento de tu navegador solo para lo estrictamente necesario (art. 22.2 LSSI):
- almacenamiento local e IndexedDB: tu curso, tus ajustes, la cola de sincronización, tu sesión, las copias automáticas y la conversación reciente con el asistente;
- caché de la app y del mapa: archivos de la propia app, sonidos y mapas, para que funcione sin conexión;
- el service worker, que permite la instalación y las notificaciones.

Al cerrar sesión se conservan tus datos locales (así sigues usando la app sin cuenta); puedes borrarlos desde Ajustes o desde los ajustes de tu navegador.

## 7. Seguridad

- Cada usuario solo puede acceder a sus propios datos (controles en la base de datos); las claves secretas (por ejemplo, la de la IA) están solo en el servidor.
- Conexiones cifradas (HTTPS).
- **Límites que debes conocer:** tu curso sincronizado **no está cifrado de extremo a extremo**; quien tuviera acceso a la base de datos podría leerlo. No guardes en Órbita información que no quieras tener en un servicio en la nube. Tampoco te protege si tu dispositivo está desbloqueado en manos de otra persona o infectado, ni si alguien conoce tu contraseña.

## 8. Tus derechos

Acceso, rectificación, supresión, oposición, limitación y portabilidad, y retirar tu consentimiento en cualquier momento.

| Derecho | Cómo |
|---|---|
| Acceso y portabilidad | Ajustes → exportar tus datos (archivo JSON) |
| Rectificación | Editando tus datos en la app |
| Supresión | Ajustes → Eliminar cuenta (borra tu cuenta y tus datos del servidor en el momento) |
| Retirar avisos | Ajustes → Notificaciones |

Para todo lo demás, o si no puedes entrar, escribe a **[CORREO_CONTACTO]** desde el correo de tu cuenta. Respondemos en el plazo de **un mes**. Si crees que no hemos tratado bien tus datos, puedes reclamar ante la **Agencia Española de Protección de Datos** (www.aepd.es); te agradeceremos que antes nos escribas.

## 9. Edad mínima

Para usar Órbita debes tener **al menos 14 años** (art. 7 LOPDGDD). Si tienes menos, no crees una cuenta. Si sabemos que una cuenta es de una persona menor de 14, la borraremos. Si tienes entre 14 y 17 años, te recomendamos comentarlo con tu madre, tu padre o tu tutor, sobre todo antes de contratar nada.

## 10. Cambios

Si cambiamos algo importante, te avisaremos en la app o por correo antes de que se aplique. La fecha de arriba indica la última versión.
