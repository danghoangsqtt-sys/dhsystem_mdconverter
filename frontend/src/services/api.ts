import axios from 'axios';

const API_BASE_URL = 'http://127.0.0.1:8000/api';


export interface ConversionResponse {
  success: boolean;
  job_id: string;
  original_filename: string;
  markdown: string;
}

export interface UploadProgressCallback {
  (progress: number): void;
}

export const uploadAndConvertFile = async (
  file: File,
  onUploadProgress?: UploadProgressCallback
): Promise<ConversionResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    const response = await axios.post<ConversionResponse>(`${API_BASE_URL}/convert`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 300000, // 5 minutes timeout for large documents
      onUploadProgress: (progressEvent) => {
        if (onUploadProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onUploadProgress(percent);
        }
      },
    });
    
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(error.response.data.detail || 'Failed to convert document');
    }
    if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
      throw new Error('Quá thời gian xử lý. Tài liệu có thể quá lớn hoặc phức tạp.');
    }
    throw new Error('Network error. Is the backend server running?');
  }
};
