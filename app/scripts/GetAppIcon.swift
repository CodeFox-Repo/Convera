#!/usr/bin/env swift

import Foundation
import AppKit

// Check if we have the correct number of arguments
guard CommandLine.arguments.count == 3 else {
    print("Usage: swift GetAppIcon.swift <app_path> <output_path>")
    exit(1)
}

let appPath = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]

// Create NSWorkspace instance
let workspace = NSWorkspace.shared

// Get the icon for the application
let icon = workspace.icon(forFile: appPath)

// Set icon size to 128x128 for high quality
let iconSize = NSSize(width: 128, height: 128)
icon.size = iconSize

// Convert to bitmap representation
guard let tiffData = icon.tiffRepresentation else {
    print("Error: Failed to get TIFF representation of icon")
    exit(1)
}

// Convert TIFF to NSBitmapImageRep
guard let bitmapRep = NSBitmapImageRep(data: tiffData) else {
    print("Error: Failed to create bitmap representation")
    exit(1)
}

// Convert to PNG data
guard let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
    print("Error: Failed to convert to PNG")
    exit(1)
}

// Write PNG data to output file
do {
    try pngData.write(to: URL(fileURLWithPath: outputPath))
    print("SUCCESS: Icon saved to \(outputPath)")
} catch {
    print("Error: Failed to write icon file - \(error)")
    exit(1)
}