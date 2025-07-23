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

/// 返回子元素的数组
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

// 获取元素的 kAXValueAttribute 属性值
func fetchValueAttribute(of element: AXUIElement) -> Any? {
    var valueRef: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &valueRef) == .success,
          let value = valueRef else {
        return nil
    }
    
    // 根据值的类型进行适当的转换
    let typeID = CFGetTypeID(value)
    
    if typeID == CFStringGetTypeID() {
        return cfString(value)
    } else if typeID == CFNumberGetTypeID() {
        var number: Double = 0
        CFNumberGetValue(value as! CFNumber, CFNumberType.doubleType, &number)
        return number
    } else if typeID == CFBooleanGetTypeID() {
        return CFBooleanGetValue(value as! CFBoolean)
    } else {
        // 对于其他类型，返回字符串表示
        return cfString(value) ?? "[无法转换的值类型]"
    }
}

// 递归查找特定角色的元素
func findElement(of element: AXUIElement, withRole role: String) -> AXUIElement? {
    var roleValue: CFTypeRef?
    if AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &roleValue) == .success,
       let roleString = cfString(roleValue),
       roleString == role {
        return element
    }
    
    for child in fetchChildren(of: element) {
        if let found = findElement(of: child, withRole: role) {
            return found
        }
    }
    
    return nil
}

// 要过滤掉的属性列表
let filteredAttributes: Set<String> = [
    "AXFrame", "AXPosition", "AXSize", "AXChildren", "AXChildrenInNavigationOrder",
    "AXTopLevelUIElement", "AXParent", "AXRole", "AXSubrole", "AXRoleDescription",
    "AXFocused", "AXFullScreen", "AXMinimized", "AXMinimizeButton", "AXCloseButton",
    "AXFullScreenButton", "AXZoomButton", "AXActivationPoint", "AXModal", "AXMain",
    "AXRequired", "AXVisited", "AXElementBusy", "AXInvalid", "ChromeAXNodeId",
    "AXBlockQuoteLevel", "AXDOMIdentifier", "AXDOMClassList", "AXInsertionPointLineNumber",
    "AXVisibleCharacterRange", "AXNumberOfCharacters", "AXSelectedTextRange", "AXSelectedTextRanges", "AXLanguage", "AXKeyShortcutsValue", "AXPopupValue"
]

var seen = Set<String>()
// 递归打印元素及其所有属性
func dump(element: AXUIElement, depth: Int = 0) {
    let indent = String(repeating: "  ", count: depth)
    var attributeNames: CFArray?
    let error = AXUIElementCopyAttributeNames(element, &attributeNames)

    if error == .success, let names = attributeNames as? [String] {
        var output = ""
        for name in names {
            if filteredAttributes.contains(name) { continue }
            var value: CFTypeRef?
            if AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success {
                if let strValue = cfString(value), !strValue.isEmpty {
                    let line = "\(strValue)"
                    if seen.insert(line).inserted {
                        output += "\(indent)\(name): \(strValue)\n"
                    }
                }
            }
        }
        print(output, terminator: "")
    }

    for child in fetchChildren(of: element) {
        dump(element: child, depth: depth + 1)
    }
}

guard CommandLine.arguments.count >= 2 else {
    print("用法: swift Context.swift <AppName>")
    exit(1)
}
let target = CommandLine.arguments[1]

guard let app = NSWorkspace.shared.runningApplications
        .first(where: { $0.localizedName == target }) else {
    print("找不到名为 \(target) 的正在运行的应用")
    exit(1)
}
let appElem = AXUIElementCreateApplication(app.processIdentifier)

// 获取焦点窗口
var winCF: CFTypeRef?
guard AXUIElementCopyAttributeValue(appElem, kAXFocusedWindowAttribute as CFString, &winCF) == .success,
      let win = winCF
else {
    print("无法获取焦点窗口")
    exit(1)
}
let windowElem = win as! AXUIElement

let manualAccessabilityAttribute = "AXManualAccessibility"
let enhancedUserInterfaceAttribute = "AXEnhancedUserInterface"

var manualResult = AXUIElementSetAttributeValue(appElem, manualAccessabilityAttribute as CFString, kCFBooleanTrue)
if manualResult == .success {
    print("成功设置 \(manualAccessabilityAttribute)")
} else {
    // 静默失败，因为不是所有应用都支持
}

var enhancedResult = AXUIElementSetAttributeValue(appElem, enhancedUserInterfaceAttribute as CFString, kCFBooleanTrue)
if enhancedResult == .success {
    print("成功设置 \(enhancedUserInterfaceAttribute)")
} else {
    // 静默失败，因为不是所有应用都支持
}
Thread.sleep(forTimeInterval: 1)
print("开始转储 \(target) 的可访问性树（已过滤）...")
dump(element: windowElem)
print("转储完成。")