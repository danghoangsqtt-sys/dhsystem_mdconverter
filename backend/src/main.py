import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
import shutil
import uuid
from pathlib import Path

from .services.docling_service import convert_document_to_markdown

app = FastAPI(
    title="Local Markdown Converter",
    description="API for converting documents to Markdown using Docling",
    version="1.0.0"
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this for production if needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define directories
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
OUTPUT_DIR = DATA_DIR / "outputs"

# Ensure directories exist
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

@app.get("/")
def read_root():
    return {"message": "Welcome to Local Markdown Converter API"}

@app.post("/api/convert")
async def convert_file(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    # Generate unique ID for this job
    job_id = str(uuid.uuid4())
    file_ext = os.path.splitext(file.filename)[1]
    
    # Save uploaded file
    upload_path = UPLOAD_DIR / f"{job_id}{file_ext}"
    try:
        with open(upload_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
        
    # Output file paths
    output_md_path = OUTPUT_DIR / f"{job_id}.md"
    
    # Convert using docling service
    try:
        markdown_content = convert_document_to_markdown(str(upload_path))
        
        # Save markdown content
        with open(output_md_path, "w", encoding="utf-8") as md_file:
            md_file.write(markdown_content)
            
        return JSONResponse(content={
            "success": True,
            "job_id": job_id,
            "original_filename": file.filename,
            "markdown": markdown_content
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")

@app.get("/api/download/{job_id}")
async def download_file(job_id: str):
    file_path = OUTPUT_DIR / f"{job_id}.md"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(
        path=file_path, 
        filename=f"{job_id}.md", 
        media_type="text/markdown"
    )
