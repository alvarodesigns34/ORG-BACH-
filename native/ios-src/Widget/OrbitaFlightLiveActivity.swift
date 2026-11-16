// Órbita · La Live Activity del modo estudio (extensión de widget).
//
// Pantalla de bloqueo (iPhone e iPad) y Dynamic Island (solo iPhone). La
// cuenta atrás y la barra de progreso las mueve el sistema con las fechas de
// `FlightAttributes.ContentState`: no hace falta que la app esté despierta.

import ActivityKit
import SwiftUI
import WidgetKit

@main
struct OrbitaWidgetBundle: WidgetBundle {
    var body: some Widget {
        OrbitaFlightLiveActivity()
    }
}

struct OrbitaFlightLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FlightAttributes.self) { context in
            LockScreenView(context: context)
                .activityBackgroundTint(Color(red: 0.04, green: 0.09, blue: 0.22))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.attributes.from).font(.headline.monospaced())
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.attributes.to).font(.headline.monospaced())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    PhaseProgress(state: context.state).tint(.blue)
                }
            } compactLeading: {
                Image(systemName: context.state.phase == "escala" ? "cup.and.saucer.fill" : "airplane")
            } compactTrailing: {
                Countdown(state: context.state).frame(maxWidth: 52)
            } minimal: {
                Image(systemName: "airplane")
            }
        }
    }
}

private struct LockScreenView: View {
    let context: ActivityViewContext<FlightAttributes>

    var title: String {
        switch context.state.phase {
        case "escala": return "Escala · descansa"
        case "pausa": return "En pausa"
        default: return context.state.subject
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(context.attributes.from)  ✈︎  \(context.attributes.to)")
                    .font(.system(.headline, design: .monospaced).weight(.bold))
                Spacer()
                Countdown(state: context.state)
                    .font(.system(.title2, design: .rounded).weight(.semibold))
                    .multilineTextAlignment(.trailing)
            }
            HStack {
                Text(title).font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.75))
                Spacer()
                Text(context.attributes.city).font(.subheadline).foregroundStyle(.white.opacity(0.6))
            }
            PhaseProgress(state: context.state)
                .tint(context.state.phase == "escala" ? .orange : .blue)
        }
        .foregroundStyle(.white)
        .padding(16)
    }
}

/// Cuenta atrás de la fase en curso (vuelo o escala). En pausa no corre.
private struct Countdown: View {
    let state: FlightAttributes.ContentState
    var body: some View {
        if state.phase == "pausa" {
            Text("\(state.pausedRemainingMinutes) min")
        } else {
            Text(timerInterval: Date()...max(Date(), state.phaseEnd), countsDown: true)
                .monospacedDigit()
        }
    }
}

private struct PhaseProgress: View {
    let state: FlightAttributes.ContentState
    var body: some View {
        if state.phase == "pausa" {
            ProgressView(value: 0.5).opacity(0.4)
        } else {
            ProgressView(timerInterval: state.phaseStart...max(state.phaseStart, state.phaseEnd), countsDown: false) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
        }
    }
}
