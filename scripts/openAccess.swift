#!/usr/bin/swift
import Foundation
import ApplicationServices
import AppKit

// 检查并请求辅助功能权限
func checkAccessibilityPermissions() -> Bool {
    let options: NSDictionary = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: kCFBooleanTrue!]
    let isTrusted = AXIsProcessTrustedWithOptions(options)
    return isTrusted
}

// 如果没有权限，则提示并退出
guard checkAccessibilityPermissions() else {
    print("错误：需要辅助功能权限。请在系统偏好设置 > 安全性与隐私 > 隐私 > 辅助功能中为本应用授权。")
    exit(1)
}

guard CommandLine.arguments.count >= 2 else {
    print("用法: swift EnableAccessibility.swift <AppName>")
    exit(1)
}
let target = CommandLine.arguments[1]

guard let app = NSWorkspace.shared.runningApplications
        .first(where: { $0.localizedName == target }) else {
    print("找不到名为 \(target) 的正在运行的应用")
    exit(1)
}
let appElem = AXUIElementCreateApplication(app.processIdentifier)

let manualAccessabilityAttribute = "AXManualAccessibility"
let enhancedUserInterfaceAttribute = "AXEnhancedUserInterface"

var manualResult = AXUIElementSetAttributeValue(appElem, manualAccessabilityAttribute as CFString, kCFBooleanTrue)
if manualResult == .success {
    print("成功设置 \(manualAccessabilityAttribute)")
} else {
    print("设置 \(manualAccessabilityAttribute) 失败或不支持")
}

var enhancedResult = AXUIElementSetAttributeValue(appElem, enhancedUserInterfaceAttribute as CFString, kCFBooleanTrue)
if enhancedResult == .success {
    print("成功设置 \(enhancedUserInterfaceAttribute)")
} else {
    print("设置 \(enhancedUserInterfaceAttribute) 失败或不支持")
}

print("辅助功能属性设置完成，等待0.2秒让设置生效...")
Thread.sleep(forTimeInterval: 1)
print("完成！现在可以运行第二个脚本来访问AX树。")