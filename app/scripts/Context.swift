#!/usr/bin/swift
import Foundation
import ApplicationServices
import AppKit

// MARK: - Global State
var observer: AXObserver?
var currentAppElem: AXUIElement?
var seen = Set<String>()
var currentAppName = "Unknown"
let commonBrowsers: Set<String> = [
    "Google Chrome", "Safari", "Firefox", "Microsoft Edge", 
    "Opera", "Brave Browser", "Arc", "Vivaldi"
]
var currentURL: String = ""
var hasFoundDocument = false

// MARK: - Accessibility Helper Functions

func log(_ message: String) {
    fputs("\(message)\n", stderr)
}

func checkAccessibilityPermissions() -> Bool {
    let options: NSDictionary = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: kCFBooleanTrue!]
    let isTrusted = AXIsProcessTrustedWithOptions(options)
    return isTrusted
}

func cfString(_ cf: CFTypeRef?) -> String? {
    guard let cf = cf else { return nil }
    if CFGetTypeID(cf) == CFAttributedStringGetTypeID() {
        let str = CFAttributedStringGetString((cf as! CFAttributedString))
        return cfString(str)
    }
    guard CFGetTypeID(cf) == CFStringGetTypeID() else { return nil }
    let s = cf as! CFString
    let len = CFStringGetLength(s)
    let cap = CFStringGetMaximumSizeForEncoding(len, CFStringBuiltInEncodings.UTF8.rawValue) + 1
    let buf = UnsafeMutablePointer<CChar>.allocate(capacity: cap)
    defer { buf.deallocate() }
    return CFStringGetCString(s, buf, cap, CFStringBuiltInEncodings.UTF8.rawValue)
        ? String(cString: buf) : nil
}

func fetchChildren(of element: AXUIElement) -> [AXUIElement] {
    var cf: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &cf) == .success,
          let value = cf,
          CFGetTypeID(value) == CFArrayGetTypeID()
    else { return [] }

    let cfArray = value as! CFArray
    let count   = CFArrayGetCount(cfArray)
    if count == 0 { return [] }

    var children: [AXUIElement] = []
    children.reserveCapacity(count)
    for i in 0..<count {
        let ptr = CFArrayGetValueAtIndex(cfArray, i)
        children.append(unsafeBitCast(ptr, to: AXUIElement.self))
    }
    return children
}

let filteredAttributes: Set<String> = [
    "AXFrame", "AXPosition", "AXSize", "AXChildren", "AXChildrenInNavigationOrder",
    "AXTopLevelUIElement", "AXParent", "AXRole", "AXSubrole", "AXRoleDescription",
    "AXFocused", "AXFullScreen", "AXMinimized", "AXMinimizeButton", "AXCloseButton",
    "AXFullScreenButton", "AXZoomButton", "AXActivationPoint", "AXModal", "AXMain",
    "AXRequired", "AXVisited", "AXElementBusy", "AXInvalid", "ChromeAXNodeId",
    "AXBlockQuoteLevel", "AXDOMIdentifier", "AXDOMClassList", "AXInsertionPointLineNumber",
    "AXVisibleCharacterRange", "AXNumberOfCharacters", "AXSelectedTextRange", 
    "AXSelectedTextRanges", "AXLanguage", "AXKeyShortcutsValue", "AXPopupValue", "AXDescription",
    "AXAutocompleteValue", "AXPlaceholderValue", "AXOrientation","AXARIALive","AXARIARelevant","AXHelp"
]
func axCallback(_ observer: AXObserver, _ element: AXUIElement, _ notification: CFString, _ refcon: UnsafeMutableRawPointer?) {
    // Only log important notifications, not every AXValueChanged
    let notificationStr = notification as String
    if notificationStr != "AXValueChanged" {
        log("Notification: \(notificationStr)")
    }
    
    guard let appElem = currentAppElem else { return }

    let appName = currentAppName

    var winCF: CFTypeRef?
    guard AXUIElementCopyAttributeValue(appElem, kAXFocusedWindowAttribute as CFString, &winCF) == .success,
          let win = winCF else {
        return
    }
    let windowElem = win as! AXUIElement

    seen.removeAll()
    hasFoundDocument = false
    currentURL = ""
    
    let content = dumpToString(element: windowElem)
    
    var jsonOutput: [String: Any] = [
        "type": "context_update",
        "timestamp": ISO8601DateFormatter().string(from: Date()),
        "notification": notification as String,
        "appName": appName,
        "content": content
    ]
    
    if commonBrowsers.contains(appName) && !currentURL.isEmpty {
        jsonOutput["currentURL"] = currentURL
    }
    
    if let jsonData = try? JSONSerialization.data(withJSONObject: jsonOutput, options: []),
       let jsonString = String(data: jsonData, encoding: .utf8) {
        print(jsonString)
        fflush(stdout)
    }
}

func startObserving(app: NSRunningApplication) {
    let pid = app.processIdentifier
    let appElem = AXUIElementCreateApplication(pid)
    currentAppElem = appElem
    currentAppName = app.localizedName ?? "Unknown"
    
    var axObs: AXObserver?
    let result = AXObserverCreate(pid, axCallback, &axObs)
    guard result == .success, let observerInstance = axObs else {
        log("Failed to create AXObserver")
        return
    }
    
    observer = observerInstance

    AXObserverAddNotification(observerInstance, appElem, kAXFocusedWindowChangedNotification as CFString, nil)
    AXObserverAddNotification(observerInstance, appElem, kAXValueChangedNotification as CFString, nil)
    AXObserverAddNotification(observerInstance, appElem, kAXUIElementDestroyedNotification as CFString, nil)

    let runLoopSource = AXObserverGetRunLoopSource(observerInstance)
    CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .defaultMode)

    axCallback(observerInstance, appElem, "InitialDump" as CFString, nil)
}

func stopObserving() {
    if let axObs = observer, let elem = currentAppElem {
        let runLoopSource = AXObserverGetRunLoopSource(axObs)
        CFRunLoopRemoveSource(CFRunLoopGetCurrent(), runLoopSource, .defaultMode)
        
        AXObserverRemoveNotification(axObs, elem, kAXFocusedWindowChangedNotification as CFString)
        AXObserverRemoveNotification(axObs, elem, kAXValueChangedNotification as CFString)
        AXObserverRemoveNotification(axObs, elem, kAXUIElementDestroyedNotification as CFString)
        
        observer = nil
        currentAppElem = nil
    }
}

// MARK: - Main Execution

guard checkAccessibilityPermissions() else {
    exit(1)
}

guard CommandLine.arguments.count >= 2 else {
    exit(1)
}
let initialName = CommandLine.arguments[1]

guard let app = NSWorkspace.shared.runningApplications.first(where: { $0.localizedName == initialName }) else {
    exit(1)
}

startObserving(app: app)

let initialStatus: [String: Any] = [
    "type": "status",
    "timestamp": ISO8601DateFormatter().string(from: Date()),
    "message": "Monitoring: \(app.localizedName ?? "")",
    "appName": app.localizedName ?? "",
    "pid": app.processIdentifier
]

if let jsonData = try? JSONSerialization.data(withJSONObject: initialStatus, options: []),
   let jsonString = String(data: jsonData, encoding: .utf8) {
    print(jsonString)
    fflush(stdout)
}

CFRunLoopRun()



func dumpToString(element: AXUIElement, depth: Int = 0) -> String {
    var result = ""
    let indent = String(repeating: "  ", count: depth)
    var attributeNames: CFArray?
    let error = AXUIElementCopyAttributeNames(element, &attributeNames)
    
    let isBrowser = commonBrowsers.contains(currentAppName)
    
    if error == .success, let names = attributeNames as? [String] {
        for name in names {
            if filteredAttributes.contains(name) { continue }
            
            if isBrowser && name == "AXDocument" && !hasFoundDocument {
                var value: CFTypeRef?
                if AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success {
                    if let strValue = cfString(value), !strValue.isEmpty {
                        currentURL = strValue
                        hasFoundDocument = true
                        
                        let line = "\(strValue)"
                        if seen.insert(line).inserted {
                            result += "[URL] \(strValue)"
                        }
                    }
                }
                continue
            }
            
            if isBrowser && name == "AXDocument" && hasFoundDocument {
                continue
            }
            
            var value: CFTypeRef?
            if AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success {
                if let strValue = cfString(value), !strValue.isEmpty {
                    let line = "\(strValue)"
                    if seen.insert(line).inserted {
                        //result += "\(indent)\(name): \(strValue)\n"
                        result += "\(strValue)"
                    }
                }
            }
        }
    }
    
    for child in fetchChildren(of: element) {
        result += dumpToString(element: child, depth: depth + 1)
    }
    
    return result
}