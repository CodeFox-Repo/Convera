import React, {
  createContext,
  ReactNode,
  useContext,
  useRef,
  useState,
} from "react";

interface FileContextType {
  files: FileList | undefined;
  openFileDialog: () => void;
  clearFiles: () => void;

  removeFile: (name: string) => void;
}

const FileContext = createContext<FileContextType>({
  files: undefined,
  openFileDialog: () => {},
  clearFiles: () => {},
  removeFile: () => {},
});

export const FileProvider = ({ children }: { children: ReactNode }) => {
  const [files, setFiles] = useState<FileList | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const clearFiles = () => {
    setFiles(undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const removeFile = (name: string) => {
    if (!files) return;
    const dt = new DataTransfer();
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.name !== name) dt.items.add(f);
    }
    const newList = dt.files;
    setFiles(newList.length ? newList : undefined);
    if (!newList.length && fileInputRef.current)
      fileInputRef.current.value = "";
  };

  return (
    <FileContext.Provider
      value={{ files, openFileDialog, clearFiles, removeFile }}
    >
      {children}
      <input
        type="file"
        multiple
        accept="*"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={(e) => {
          const newFiles = e.target.files;
          if (!newFiles) return;

          const dt = new DataTransfer();
          if (files) {
            Array.from(files).forEach((f) => dt.items.add(f));
          }
          Array.from(newFiles).forEach((f) => dt.items.add(f));

          setFiles(dt.files);

          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }}
      />
    </FileContext.Provider>
  );
};

export const useFileContext = () => useContext(FileContext);
