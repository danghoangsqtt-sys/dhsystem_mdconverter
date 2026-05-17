import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileText, Loader2, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { Agentation } from 'agentation';
import { uploadAndConvertFile, ConversionResponse } from './services/api';
import './App.css';

function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConversionResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFile = async (file: File) => {
    // Validate file type
    const validExtensions = ['.pdf', '.docx', '.doc', '.pptx', '.html'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
      setError(`Unsupported file format. Please upload PDF, Word, or HTML documents.`);
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await uploadAndConvertFile(file);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const downloadMarkdown = () => {
    if (!result) return;
    
    const blob = new Blob([result.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.original_filename.split('.')[0]}_converted.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="app-container">
        <header className="header">
          <h1>Markdown Converter</h1>
          <p>Professional, accurate conversion of your documents into AI-ready Markdown</p>
        </header>

        {!result && !isLoading && (
          <div 
            className={`dropzone ${isDragging ? 'active' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="dropzone-icon" />
            <div className="dropzone-text">Drag and drop your document here</div>
            <div className="dropzone-subtext">Supports PDF, DOCX, DOC, PPTX (via Docling)</div>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileChange}
              accept=".pdf,.docx,.doc,.pptx,.html"
            />
            <button className="btn-primary" style={{ marginTop: '16px' }} onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}>
              Browse Files
            </button>
          </div>
        )}

        {error && (
          <div className="card" style={{ borderColor: 'var(--color-error)', backgroundColor: '#FDEDED' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--color-error)' }}>
              <AlertCircle />
              <div>
                <strong>Error processing file</strong>
                <p>{error}</p>
              </div>
            </div>
            <button className="btn-primary" style={{ marginTop: '16px' }} onClick={() => setError(null)}>
              Try Again
            </button>
          </div>
        )}

        {isLoading && (
          <div className="card loading-container">
            <Loader2 className="spinner" size={48} />
            <h2>Converting Document</h2>
            <p style={{ color: 'var(--color-secondary)' }}>
              Analyzing layout, extracting text, math formulas, and tables...
            </p>
          </div>
        )}

        {result && (
          <div className="card preview-container">
            <div className="preview-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <CheckCircle2 color="var(--color-success)" />
                <div>
                  <h3 style={{ margin: 0 }}>Conversion Successful</h3>
                  <span className="label">{result.original_filename}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  className="btn-primary" 
                  style={{ backgroundColor: 'var(--color-secondary)' }}
                  onClick={() => setResult(null)}
                >
                  Convert Another
                </button>
                <button className="btn-primary" onClick={downloadMarkdown}>
                  <Download size={18} /> Download Markdown
                </button>
              </div>
            </div>
            
            <div>
              <span className="label" style={{ display: 'block', marginBottom: '8px' }}>Preview</span>
              <div className="preview-content">
                {result.markdown}
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Kích hoạt Agentation trong môi trường Development */}
      {import.meta.env.DEV && <Agentation />}
    </>
  );
}

export default App;
