import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

export interface ConversionResponse {
  success: boolean;
  job_id: string;
  original_filename: string;
  markdown: string;
}

export const uploadAndConvertFile = async (file: File): Promise<ConversionResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    const response = await axios.post<ConversionResponse>(`${API_BASE_URL}/convert`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(error.response.data.detail || 'Failed to convert document');
    }
    throw new Error('Network error. Is the backend server running?');
  }
};
