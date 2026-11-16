// Órbita · Controlador principal de la app nativa.
//
// Registra el plugin local de la Live Activity. En Main.storyboard, la
// escena «Bridge View Controller» tiene que usar esta clase (Identity
// Inspector → Custom Class → OrbitaViewController, módulo App).

import Capacitor
import UIKit

class OrbitaViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LiveActivityPlugin())
    }
}
