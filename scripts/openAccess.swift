#!/usr/bin/swift
import Foundation
import ApplicationServices
import AppKit

func checkAccessibilityPermissions() -> Bool {
    let options: NSDictionary = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: kCFBooleanTrue!]
    let isTrusted = AXIsProcessTrustedWithOptions(options)
    return isTrusted
}

guard checkAccessibilityPermissions() else {
    exit(1)
}

guard CommandLine.arguments.count >= 2 else {
    exit(1)
}
let target = CommandLine.arguments[1]

guard let app = NSWorkspace.shared.runningApplications
        .first(where: { $0.localizedName == target }) else {
    exit(1)
}
let appElem = AXUIElementCreateApplication(app.processIdentifier)

let manualAccessabilityAttribute = "AXManualAccessibility"
let enhancedUserInterfaceAttribute = "AXEnhancedUserInterface"

var manualResult = AXUIElementSetAttributeValue(appElem, manualAccessabilityAttribute as CFString, kCFBooleanTrue)

var enhancedResult = AXUIElementSetAttributeValue(appElem, enhancedUserInterfaceAttribute as CFString, kCFBooleanTrue)
Thread.sleep(forTimeInterval: 1)