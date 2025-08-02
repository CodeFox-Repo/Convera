#!/usr/bin/env swift

import Foundation
import AppKit

// Check if we have the correct number of arguments
guard CommandLine.arguments.count == 2 else {
    print("Usage: swift GetAppIconBase64.swift <app_path>")
    exit(1)
}

let appPath = CommandLine.arguments[1]

// Create NSWorkspace instance
let workspace = NSWorkspace.shared

// Get the icon for the application
let icon = workspace.icon(forFile: appPath)

// Set icon size to 24x24 for minimal base64 output
let iconSize = NSSize(width: 24, height: 24)
icon.size = iconSize

// Convert to bitmap representation
guard let tiffData = icon.tiffRepresentation else {
    print("ERROR: Failed to get TIFF representation of icon")
    exit(1)
}

// Convert TIFF to NSBitmapImageRep
guard let bitmapRep = NSBitmapImageRep(data: tiffData) else {
    print("ERROR: Failed to create bitmap representation")
    exit(1)
}

// Convert to PNG data
guard let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
    print("ERROR: Failed to convert to PNG")
    exit(1)
}

// Convert to base64 and output data URL
let base64String = pngData.base64EncodedString()
let dataUrl = "data:image/png;base64,\(base64String)"
print("SUCCESS:\(dataUrl)")