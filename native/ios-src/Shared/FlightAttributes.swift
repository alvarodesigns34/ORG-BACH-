// Órbita · Live Activity del modo estudio.
//
// Este archivo tiene que pertenecer a DOS targets en Xcode: «App» y la
// extensión «OrbitaWidget» (File Inspector → Target Membership). Es el
// contrato entre la app, que inicia y actualiza la actividad, y el widget,
// que la dibuja.

import ActivityKit
import Foundation

struct FlightAttributes: ActivityAttributes {
    /// Lo que cambia durante el vuelo.
    struct ContentState: Codable, Hashable {
        /// «quedan» se calcula en el propio sistema con estas fechas, así la
        /// cuenta atrás avanza sola sin que la app tenga que despertarse.
        var phaseStart: Date
        var phaseEnd: Date
        /// vuelo | escala | pausa
        var phase: String
        /// Minutos que quedan de vuelo cuando está en pausa (no corre).
        var pausedRemainingMinutes: Int
        var subject: String
    }

    /// Lo fijo del vuelo.
    var from: String
    var to: String
    var city: String
    var plannedMinutes: Int
}
