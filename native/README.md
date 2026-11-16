# Órbita nativa (iPad/iPhone) con Live Activity

Esta carpeta prepara una **app nativa opcional** que envuelve la misma web de
Órbita con [Capacitor](https://capacitorjs.com) y añade lo que una web no puede
tener: la **Live Activity** del modo estudio en la pantalla de bloqueo y los
**avisos locales** de aterrizaje y escalas sin servidor.

La web publicada (GitHub Pages) no cambia y no depende de nada de aquí: el
puente `src/native/liveActivity.ts` solo actúa si detecta que corre dentro de
la app nativa.

> **No se ha compilado.** Desde el entorno en la nube donde se preparó no hay
> macOS ni Xcode, así que el código Swift de `ios-src/` está escrito con las
> API documentadas, pero sin compilar ni probar en un dispositivo. Cuenta con
> tener que corregir algún detalle al compilar por primera vez.

## Lo que hace falta

- Un Mac con **Xcode 16 o posterior** (y sus herramientas de línea de órdenes).
- **Node.js 22** y npm (el mismo que usa el proyecto web).
- Una **cuenta de Apple** iniciada en Xcode. Con una gratuita puedes instalar
  la app en tu iPad, pero caduca a los 7 días y hay que volver a instalarla;
  con la de desarrollador (99 €/año) dura un año y podrías publicarla.
- El iPad con **iPadOS 26 o posterior** para ver la Live Activity. En
  versiones anteriores de iPadOS el sistema no muestra Live Activities de
  otras apps en iPad (sí en iPhone desde iOS 16.2): la app funciona igual,
  simplemente sin la tarjeta en vivo.

## Pasos

1. **Clona el repositorio** en el Mac y entra en la carpeta:

   ```bash
   git clone https://github.com/alvarodesigns34/ORG-BACH-.git
   cd ORG-BACH-
   npm ci
   cd native
   npm install
   ```

2. **Crea el proyecto de iOS** (solo la primera vez):

   ```bash
   npm run web          # compila la web en ../dist
   npx cap add ios      # crea native/ios con el proyecto de Xcode
   npx cap sync ios     # copia la web y los plugins
   npm run open         # abre Xcode
   ```

   Si quieres otro identificador de app, cámbialo en `capacitor.config.json`
   (`appId`) **antes** de `cap add ios`.

3. **Añade el código de la app** (en Xcode, target «App»):
   - Arrastra `ios-src/App/LiveActivityPlugin.swift` y
     `ios-src/App/OrbitaViewController.swift` a la carpeta `App` del
     proyecto (marca «Copy items if needed» y el target **App**).
   - Arrastra `ios-src/Shared/FlightAttributes.swift` igual, al target **App**.
   - Abre `Main.storyboard`, selecciona la escena *Bridge View Controller* y,
     en el inspector de identidad, pon **Custom Class → `OrbitaViewController`**
     (módulo *App*).

4. **Crea la extensión de la Live Activity**:
   - *File → New → Target… → Widget Extension*. Nombre: `OrbitaWidget`.
     Marca **Include Live Activity**. Desmarca *Include Configuration App
     Intent*. Cuando pregunte si activar el esquema, acepta.
   - Borra los archivos de ejemplo que crea Xcode dentro de `OrbitaWidget`
     (el `…Bundle.swift`, el `…LiveActivity.swift` y el widget de ejemplo).
   - Arrastra `ios-src/Widget/OrbitaFlightLiveActivity.swift` a la carpeta
     `OrbitaWidget` (target **OrbitaWidget**).
   - Selecciona `FlightAttributes.swift` y, en *Target Membership*, marca
     **también** `OrbitaWidget` (tiene que estar en los dos targets).
   - En el target `OrbitaWidget` → *General*, pon el mismo *Minimum
     Deployment* que la app (iOS 16.2 o superior).

5. **Activa las Live Activities** en la app:
   - Target **App** → pestaña *Info* → añade la clave
     `NSSupportsLiveActivities` (*Supports Live Activities*) de tipo Boolean
     a **YES**.
   - Target **App** → *General* → *Minimum Deployments*: **iOS 16.2** o
     superior.

6. **Firma**: en *Signing & Capabilities* de **los dos** targets (App y
   OrbitaWidget), elige tu equipo (*Team*). Xcode genera los perfiles. El
   identificador del widget debe empezar por el de la app
   (`es.orbita.estudios.OrbitaWidget`).

7. **Instala en el iPad**: conéctalo por cable (o en la misma red con
   *Connect via network*), elígelo arriba en Xcode y pulsa ▶︎. La primera vez,
   en el iPad: *Ajustes → General → VPN y gestión de dispositivos* → confía
   en tu cuenta de desarrollador. Si iPadOS lo pide, activa el *Modo
   desarrollador* (*Ajustes → Privacidad y seguridad*).

8. **Pruébalo**: abre Órbita, despega un vuelo y bloquea el iPad. Deberías
   ver la tarjeta con la ruta, la asignatura, la cuenta atrás y la barra de
   progreso; en una escala, la cuenta atrás del descanso. Al aterrizar llega
   la notificación local y la tarjeta se queda 15 minutos con el resultado.

## Cada vez que cambie la web

```bash
cd native
npm run sync    # recompila la web y la copia al proyecto de iOS
```

y vuelve a ejecutar desde Xcode. Para no depender del Mac en cada cambio se
podría hacer que la app cargue la web publicada (`server.url` en
`capacitor.config.json`), a cambio de necesitar conexión al abrirla.

## Qué cambia dentro de la app nativa

| | Web / PWA | App nativa |
|---|---|---|
| Tarjeta en la pantalla de bloqueo | «Ahora suena» (Media Session), solo con audio | Live Activity con cuenta atrás y progreso, sin audio |
| Aviso al aterrizar y en escalas | Web Push desde Supabase (requiere cuenta) | Notificación local (sin cuenta ni red) |
| Datos, sincronización, asistente | Iguales | Iguales |

## Lo que no está hecho

- La Live Activity no se actualiza por push (APNs). No hace falta: las
  fechas de la cuenta atrás viajan en el propio estado y el sistema la anima
  solo. Iniciarla o cambiarla en remoto (desde otro dispositivo) sí lo
  necesitaría.
- Los botones de la tarjeta (pausar desde la pantalla de bloqueo) requieren
  *App Intents* interactivos (iOS 17+); se puede añadir más adelante.
- El Service Worker y Web Push no funcionan dentro de la app nativa (iOS no
  los admite en ese modo); por eso allí se usan notificaciones locales.
