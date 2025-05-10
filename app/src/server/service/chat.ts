import { Message } from "ai";
import path from "path";
import os from "os";
import { writeFile, mkdir, readFile, readdir } from "fs/promises";
import fs from "fs";

export interface ChatData {
  id: string;
  createdAt: string;
  lastUpdated: string;
  messages: Message[];
  title: string;
}

const chatDir = path.join(os.homedir(), ".foxychat", "chat");

/**
 * Save chat data to a file
 */
export async function saveChat({
  id,
  messages,
}: {
  id: string;
  messages: Message[];
}): Promise<void> {
  // Create the directory if it doesn't exist
  if (!fs.existsSync(chatDir)) {
    await mkdir(chatDir, { recursive: true });
  }
  
  // Check if the chat file already exists
  const chatFilePath = path.join(chatDir, `${id}.json`);
  let existingData: Partial<ChatData> = {};
  
  try {
    if (fs.existsSync(chatFilePath)) {
      const fileContent = await readFile(chatFilePath, 'utf8');
      existingData = JSON.parse(fileContent);
    }
  } catch (error) {
    console.error(`Error reading existing chat file ${id}:`, error);
    // Continue with creating a new file
  }
  
  // Determine title from the first user message
  let title = existingData.title || '';
  if (!title && messages.length > 0) {
    const firstUserMessage = messages.find(msg => msg.role === 'user');
    if (firstUserMessage) {
      // Limit title length to 50 characters
      title = firstUserMessage.content.substring(0, 50);
      if (firstUserMessage.content.length > 50) {
        title += '...';
      }
    }
  }
  
  // Create or update chat data
  const chatData: ChatData = {
    id,
    createdAt: existingData.createdAt || new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    messages,
    title
  };
  
  const content = JSON.stringify(chatData, null, 2);
  await writeFile(chatFilePath, content);
}

/**
 * Get a list of all saved chats
 */
export async function getChats(): Promise<ChatData[]> {
  // Create the directory if it doesn't exist
  if (!fs.existsSync(chatDir)) {
    await mkdir(chatDir, { recursive: true });
    return [];
  }
  
  const files = await readdir(chatDir);
  const chatFiles = files.filter(file => file.endsWith('.json'));
  
  const chats: ChatData[] = [];
  
  for (const file of chatFiles) {
    try {
      const filePath = path.join(chatDir, file);
      const content = await readFile(filePath, 'utf8');
      const chatData = JSON.parse(content) as ChatData;
      chats.push(chatData);
    } catch (error) {
      console.error(`Error reading chat file ${file}:`, error);
      // Skip this file and continue
    }
  }
  
  // Sort by lastUpdated (newest first)
  return chats.sort((a, b) =>
    new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
  );
}

/**
 * Get a specific chat by ID
 */
export async function getChatById(id: string): Promise<ChatData | null> {
  const chatFilePath = path.join(chatDir, `${id}.json`);
  
  if (!fs.existsSync(chatFilePath)) {
    return null;
  }
  
  try {
    const content = await readFile(chatFilePath, 'utf8');
    return JSON.parse(content) as ChatData;
  } catch (error) {
    console.error(`Error reading chat file ${id}:`, error);
    return null;
  }
}

/**
 * Delete a chat by ID
 */
export async function deleteChat(id: string): Promise<boolean> {
  const chatFilePath = path.join(chatDir, `${id}.json`);
  
  if (!fs.existsSync(chatFilePath)) {
    return false;
  }
  
  try {
    fs.unlinkSync(chatFilePath);
    return true;
  } catch (error) {
    console.error(`Error deleting chat file ${id}:`, error);
    return false;
  }
}