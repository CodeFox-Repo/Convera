// 自动选区检测模块
import { clipboard } from "electron";
import { getChatWindow } from "./windows/chat-window";
import { setInputContent } from "@/electro-bridge/ipc/ipc-handlers";

// 使用 uiohook-napi 替代 iohook
let uiohook: any = null;
let uiohookNapi: any = null;
let getWindows: any = null;

// 尝试动态加载依赖
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const uiohookModule = require('uiohook-napi');
  // 实际的事件发射器在 uiohookModule.uIOhook
  uiohook = uiohookModule.uIOhook;
  uiohookNapi = uiohookModule;
  console.log('✅ uiohook-napi loaded successfully');
} catch (error) {
  console.warn('⚠️ uiohook-napi not available:', error);
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const getWindowsModule = require('get-windows');
  // get-windows 模块的默认导出可能是一个函数或者在 .default 中
  getWindows = getWindowsModule.default || getWindowsModule;
  console.log('✅ get-windows loaded, type:', typeof getWindows);
} catch (error) {
  console.warn('⚠️ get-windows not available:', error);
}

let lastHash = '';
let isWatching = false;
let debounceTimer: NodeJS.Timeout | null = null;

// 剪贴板工具函数需要的变量在函数内部定义

// 检查点击是否在 FoxyChat 窗口内
async function isClickOnOurApp(x: number, y: number): Promise<boolean> {
  try {
    const chatWindow = getChatWindow();
    if (!chatWindow || chatWindow.isDestroyed()) {
      return false;
    }
    
    // 获取窗口位置和大小
    const bounds = chatWindow.getBounds();
    
    // 检查点击坐标是否在窗口范围内
    const isInWindow = 
      x >= bounds.x && 
      x <= bounds.x + bounds.width && 
      y >= bounds.y && 
      y <= bounds.y + bounds.height;
    
    if (isInWindow) {
      console.log(`🎯 Click detected within FoxyChat window at (${x}, ${y})`);
    }
    
    return isInWindow;
  } catch (error) {
    console.warn('⚠️ Error checking if click is on our app:', error);
    return false;
  }
}

function createTextHash(text: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto");
  return crypto.createHash('sha1').update(text).digest('hex');
}

async function simulateClipboardCopy(): Promise<void> {
  try {
    // 导入robot模块
    const robot = await import("@/shared/robot");
    const robotjs = robot.default as any;
    
    if (!robotjs) {
      console.warn('Robot module not available');
      return;
    }

    // 清除可能的按键状态
    robotjs.keyToggle("shift", "up");
    robotjs.keyToggle("control", "up");
    robotjs.keyToggle("alt", "up");

    // 等待一小段时间
    await new Promise((resolve) => setImmediate(resolve));

    // 执行复制操作
    if (process.platform === "darwin") {
      robotjs.keyTap("c", "command");
    } else {
      robotjs.keyTap("c", "control");
    }

    // 等待复制完成
    await new Promise((resolve) => setTimeout(resolve, 50));
  } catch (error) {
    console.error('Error simulating clipboard copy:', error);
    throw error;
  }
}


// 处理选区检测（由鼠标事件触发）
async function handleSelectionCheck() {
  console.log('🎯 handleSelectionCheck called');
  
  // 防抖处理，避免重复触发
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  
  debounceTimer = setTimeout(async () => {
    try {
      console.log('🔍 Checking for text selection...');
      
      // 保存当前剪贴板内容
      const originalText = clipboard.readText();
      const originalImage = clipboard.readImage();
      
      // 模拟 Cmd+C 来获取当前选区
      await simulateClipboardCopy();
      
      // 获取复制后的内容
      const selectedText = clipboard.readText();
      
      // 恢复原有剪贴板内容
      if (originalImage && !originalImage.isEmpty()) {
        clipboard.writeImage(originalImage);
      } else {
        clipboard.writeText(originalText);
      }
      
      // 检查是否有有效的选区内容
      if (!selectedText || selectedText.length < 1) {
        console.log('❌ No selection detected - clearing context');
        clearContextButton();
        return;
      }
      
      // 检查是否选择的是空白字符或换行符
      if (selectedText.trim().length === 0) {
        console.log('❌ Empty/whitespace selection - clearing context');
        clearContextButton();
        return;
      }
      
      // 检查是否与原剪贴板内容完全相同
      if (selectedText === originalText) {
        console.log('📋 Same as original clipboard - likely no new selection');
        
        // 当选择的内容与原剪贴板相同时，说明没有新的选择
        // 这种情况通常发生在点击空白处或取消选择时
        console.log('🧹 No new selection detected - clearing context');
        clearContextButton();
        return;
      }
      
      // 检查选择的内容是否过短（可能是意外选择）
      if (selectedText.length < 3) {
        console.log('❌ Selection too short - clearing context');
        clearContextButton();
        return;
      }
      
      // 检查是否为新内容（避免重复处理）
      const textHash = createTextHash(selectedText);
      if (textHash === lastHash) {
        console.log('🔄 Same content as before, skipping...');
        return;
      }
      
      console.log('✨ New selection detected via mouse!');
      console.log('📝 Selected text:', `"${selectedText.slice(0, 100)}..."`)
      
      // 更新哈希值
      lastHash = textHash;
      currentClipboardHash = textHash;
      
      // 获取前台应用信息
      let appName = 'Unknown';
      let appId: string | undefined;
      if (getWindows) {
        try {
          const windows = await getWindows();
          const activeWindow = windows.find((win: any) => {
            return win.owner?.name && win.bounds?.x !== undefined;
          });
          
          if (activeWindow) {
            appName = activeWindow.owner?.name || activeWindow.title || 'Unknown';
            appId = activeWindow.owner?.bundleId || activeWindow.owner?.processId?.toString();
          }
        } catch (error) {
          console.warn('Failed to get active window info:', error);
        }
      }
      
      // 发送到前端
      const chatWindow = getChatWindow();
      if (chatWindow && !chatWindow.isDestroyed() && chatWindow.webContents) {
        console.log(`✅ Selection detected from ${appName}: "${selectedText.slice(0, 50)}..."`);
        
        const content: any = {
          text: selectedText,
        };
        
        if (appName !== 'Unknown') {
          content.metadata = {
            sourceApp: appName,
            sourceAppId: appId,
          };
        }
        
        setInputContent(chatWindow, content);
      }
      
    } catch (error) {
      console.error('Error in handleSelectionCheck:', error);
    }
  }, 150); // 150ms 防抖延迟，比轮询更快响应
}

// 清空 context button
function clearContextButton(): void {
  try {
    console.log('🧹 Manually clearing context button');
    
    const chatWindow = getChatWindow();
    if (chatWindow && !chatWindow.isDestroyed() && chatWindow.webContents) {
      setInputContent(chatWindow, { text: "" });
      
      // 重置哈希值
      lastHash = '';
      currentClipboardHash = '';
      
      console.log('✅ Context button cleared successfully');
    } else {
      console.warn('⚠️ Chat window not available for clearing');
    }
  } catch (error) {
    console.error('Error clearing context button:', error);
  }
}

// 当前剪贴板内容的哈希值（用于检测变化）
let currentClipboardHash = '';
let pollInterval: NodeJS.Timeout | null = null;
const POLL_INTERVAL_MS = 250; // 每250ms检查一次剪贴板，更快的响应

// 轮询方式检测剪贴板变化
async function pollClipboardChanges(): Promise<void> {
  try {
    const currentText = clipboard.readText();
    
    // 忽略空文本或太短的文本
    if (!currentText || currentText.length < 3) {
      return;
    }
    
    // 检查是否为新内容
    const textHash = createTextHash(currentText);
    if (textHash === currentClipboardHash) {
      return; // 没有变化
    }
    
    // 检查是否为重复内容（与之前处理过的内容比较）
    if (textHash === lastHash) {
      return; // 重复内容，跳过
    }
    
    console.log('📋 Clipboard change detected:', currentText.slice(0, 50) + '...');
    
    // 更新当前剪贴板哈希值
    currentClipboardHash = textHash;
    lastHash = textHash;
    
    // 获取前台应用信息
    let appName = 'Unknown';
    let appId: string | undefined;
    if (getWindows) {
      try {
        const windows = await getWindows();
        console.log('🪟 Active windows:', windows.length);
        
        // 找到前台活跃窗口
        const activeWindow = windows.find((win: any) => {
          // 检查窗口是否有 owner 信息
          return win.owner?.name && win.bounds?.x !== undefined;
        });
        
        if (activeWindow) {
          appName = activeWindow.owner?.name || activeWindow.title || 'Unknown';
          appId = activeWindow.owner?.bundleId || activeWindow.owner?.processId?.toString();
          console.log(`📱 Active app: ${appName} (${appId})`);
        }
      } catch (error) {
        console.warn('Failed to get active window info:', error);
      }
    }
    
    // 发送到前端
    const chatWindow = getChatWindow();
    if (chatWindow && !chatWindow.isDestroyed()) {
      console.log(`✅ Clipboard-detected selection from ${appName}: "${currentText.slice(0, 50)}..."`);
      
      // 发送内容和应用信息
      const content: any = {
        text: currentText,
      };
      
      // 添加应用信息到元数据（可选）
      if (appName !== 'Unknown') {
        content.metadata = {
          sourceApp: appName,
          sourceAppId: appId,
        };
      }
      
      // 确保窗口内容已加载
      if (chatWindow.webContents) {
        console.log('📤 Sending content to chat window via IPC...');
        setInputContent(chatWindow, content);
      } else {
        console.warn('⚠️ Chat window webContents not ready');
      }
    } else {
      console.warn('⚠️ Chat window not available or destroyed');
    }
    
  } catch (error) {
    console.error('Error in pollClipboardChanges:', error);
  }
}

// 检查 macOS 辅助功能权限
function checkMacOSAccessibilityPermission(): boolean {
  if (process.platform !== 'darwin') {
    return true; // 非 macOS 系统不需要此权限
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { systemPreferences } = require('electron');
    
    // 检查是否有辅助功能权限
    const hasPermission = systemPreferences.isTrustedAccessibilityClient(false);
    
    if (!hasPermission) {
      console.log('⚠️ macOS Accessibility permission required for real-time selection detection');
      console.log('🔧 Prompting user for Accessibility permission...');
      
      // 尝试请求权限（会打开系统偏好设置）
      const permissionGranted = systemPreferences.isTrustedAccessibilityClient(true);
      
      if (!permissionGranted) {
        console.log('❌ Accessibility permission not granted');
        console.log('💡 Please enable Accessibility access for FoxyChat in System Preferences > Security & Privacy > Privacy > Accessibility');
        return false;
      }
    }
    
    console.log('✅ macOS Accessibility permission granted');
    return true;
  } catch (error) {
    console.warn('⚠️ Error checking macOS accessibility permission:', error);
    return false;
  }
}

export function startAutoSelectionWatcher(): boolean {
  if (isWatching) {
    console.log('📡 Auto selection watcher already running');
    return true;
  }

  try {
    console.log('🚀 Starting auto selection watcher...');
    console.log('🔍 uiohook availability:', !!uiohook);
    console.log('🔍 getWindows availability:', !!getWindows);
    
    // 检查 macOS 权限
    const hasAccessibilityPermission = checkMacOSAccessibilityPermission();
    
    // 初始化当前剪贴板哈希值
    const initialText = clipboard.readText();
    if (initialText) {
      currentClipboardHash = createTextHash(initialText);
      console.log('📝 Initial clipboard hash set');
    }
    
    isWatching = true;
    console.log('✅ Auto selection watcher started successfully');
    
    // 启用 uiohook 进行鼠标事件监听（如果有权限）
    if (uiohook && hasAccessibilityPermission) {
      try {
        console.log('🎯 Starting uiohook-napi for mouse event detection...');
        
        // 监听所有鼠标和键盘事件
        uiohook.on('input', async (event: any) => {
          const eventType = event.type;
          
          // 检查是否点击在 FoxyChat 窗口内
          const isClickOnFoxyChat = await isClickOnOurApp(event.x, event.y);
          
          if (eventType === uiohookNapi.EventType.EVENT_MOUSE_RELEASED) {
            console.log('🖱️ Mouse released - checking for text selection...');
            // 如果点击在 FoxyChat 内，不执行选择检查（保持当前状态）
            if (isClickOnFoxyChat) {
              console.log('🏠 Click within FoxyChat - keeping current selection state');
              return;
            }
            // 延迟一点检查，让选区完成
            setTimeout(() => {
              handleSelectionCheck();
            }, 100);
          } else if (eventType === uiohookNapi.EventType.EVENT_MOUSE_PRESSED) {
            console.log('🖱️ Mouse pressed - potential selection start');
            // 如果点击在 FoxyChat 内，不执行选择检查
            if (isClickOnFoxyChat) {
              console.log('🏠 Click within FoxyChat - keeping current selection state');
              return;
            }
            // 鼠标按下可能是开始选择或者点击取消选择
            setTimeout(() => {
              handleSelectionCheck();
            }, 150);
          } else if (eventType === uiohookNapi.EventType.EVENT_MOUSE_CLICKED) {
            console.log('🖱️ Mouse clicked - checking if selection was cleared');
            // 如果点击在 FoxyChat 内，不执行选择检查
            if (isClickOnFoxyChat) {
              console.log('🏠 Click within FoxyChat - keeping current selection state');
              return;
            }
            // 单击可能取消了选区
            setTimeout(() => {
              handleSelectionCheck();
            }, 200);
          }
        });
        
        uiohook.start();
        console.log('✅ uiohook-napi started for real-time selection detection');
        console.log('🎯 Using mouse event detection - clipboard polling disabled');
      } catch (error) {
        console.warn('⚠️ uiohook-napi failed to start:', error);
        console.log('📋 Falling back to clipboard polling only');
        // 启动轮询作为后备
        pollInterval = setInterval(pollClipboardChanges, POLL_INTERVAL_MS);
      }
    } else if (!hasAccessibilityPermission) {
      console.log('⚠️ No Accessibility permission - using clipboard polling only');
      console.log('💡 To enable real-time selection detection, grant Accessibility permission and restart FoxyChat');
      // 启动轮询
      pollInterval = setInterval(pollClipboardChanges, POLL_INTERVAL_MS);
    } else {
      console.log('📋 uiohook not available - using clipboard polling only');
      // 启动轮询
      pollInterval = setInterval(pollClipboardChanges, POLL_INTERVAL_MS);
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Failed to start auto selection watcher:', error);
    return false;
  }
}

export function stopAutoSelectionWatcher(): void {
  if (!isWatching) return;

  try {
    console.log('🛑 Stopping auto selection watcher...');
    
    // 清除轮询定时器
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    
    // 清除防抖定时器
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    
    // 如果有 uiohook，也停止它
    if (uiohook && uiohook.removeAllListeners) {
      try {
        uiohook.removeAllListeners('mouseup');
        uiohook.stop();
      } catch (error) {
        console.warn('Error stopping uiohook-napi:', error);
      }
    }
    
    // 重置状态
    isWatching = false;
    lastHash = '';
    currentClipboardHash = '';
    
    console.log('✅ Auto selection watcher stopped');
    
  } catch (error) {
    console.error('Error stopping auto selection watcher:', error);
  }
}

export function isAutoSelectionWatcherRunning(): boolean {
  return isWatching;
}