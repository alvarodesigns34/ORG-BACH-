// Órbita · Puente entre la web (modo estudio) y ActivityKit.
//
// La web llama a `window.Capacitor.Plugins.LiveActivity.start/update/end`
// (ver src/native/liveActivity.ts). En el navegador ese objeto no existe y la
// web no hace nada: este código solo corre dentro de la app nativa.
//
// Requisitos: iOS/iPadOS 16.2 o posterior para compilar; en iPad, las Live
// Activities de apps de terceros solo se muestran desde iPadOS 26 (en
// versiones anteriores `areActivitiesEnabled` es falso y no se inicia nada).

import ActivityKit
import Capacitor
import Foundation

@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            call.resolve(["available": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["available": false])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { return call.resolve(["started": false]) }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return call.resolve(["started": false]) }
        guard let state = Self.state(from: call) else { return call.reject("Faltan datos del vuelo") }
        // Una sola actividad: si quedó otra de un vuelo anterior, fuera.
        Task {
            for activity in Activity<FlightAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            let attributes = FlightAttributes(
                from: call.getString("from") ?? "",
                to: call.getString("to") ?? "",
                city: call.getString("city") ?? "",
                plannedMinutes: call.getInt("plannedMinutes") ?? 0
            )
            do {
                _ = try Activity.request(
                    attributes: attributes,
                    content: .init(state: state, staleDate: state.phaseEnd.addingTimeInterval(60)),
                    pushType: nil
                )
                call.resolve(["started": true])
            } catch {
                call.reject("No se pudo iniciar la Live Activity: \(error.localizedDescription)")
            }
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { return call.resolve() }
        guard let state = Self.state(from: call) else { return call.reject("Faltan datos del vuelo") }
        Task {
            for activity in Activity<FlightAttributes>.activities {
                await activity.update(.init(state: state, staleDate: state.phaseEnd.addingTimeInterval(60)))
            }
            call.resolve()
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { return call.resolve() }
        let landed = call.getBool("landed") ?? false
        Task {
            for activity in Activity<FlightAttributes>.activities {
                // Al aterrizar se queda un rato en la pantalla de bloqueo con el
                // resultado; si se abandona, desaparece.
                await activity.end(
                    activity.content,
                    dismissalPolicy: landed ? .after(Date().addingTimeInterval(15 * 60)) : .immediate
                )
            }
            call.resolve()
        }
    }

    private static func state(from call: CAPPluginCall) -> FlightAttributes.ContentState? {
        guard let start = call.getDouble("phaseStart"), let end = call.getDouble("phaseEnd") else { return nil }
        return FlightAttributes.ContentState(
            phaseStart: Date(timeIntervalSince1970: start / 1000),
            phaseEnd: Date(timeIntervalSince1970: end / 1000),
            phase: call.getString("phase") ?? "vuelo",
            pausedRemainingMinutes: call.getInt("pausedRemainingMinutes") ?? 0,
            subject: call.getString("subject") ?? "Estudio libre"
        )
    }
}
