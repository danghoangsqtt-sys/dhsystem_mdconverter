import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownPreviewProps {
  content: string;
}

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content }) => {
  return (
    <div className="h-full w-full bg-white p-8 overflow-y-auto">
      <div className="prose prose-sm md:prose-base max-w-none font-serif leading-relaxed text-gray-800">
        <ReactMarkdown 
          remarkPlugins={[remarkGfm]}
          components={{
              h1: ({node, ...props}) => <h1 className="text-2xl font-bold uppercase text-center mb-6 mt-8 text-blue-900" {...props} />,
              h2: ({node, ...props}) => <h2 className="text-xl font-bold mt-6 mb-4 text-blue-800 border-b pb-1" {...props} />,
              h3: ({node, ...props}) => <h3 className="text-lg font-bold mt-4 mb-2 text-gray-800" {...props} />,
              h4: ({node, ...props}) => <h4 className="text-base font-semibold mt-3 mb-2 text-gray-800" {...props} />,
              p: ({node, ...props}) => <p className="mb-4 text-justify" {...props} />,
              ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-1" {...props} />,
              ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-4 space-y-1" {...props} />,
              blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-gray-300 pl-4 italic my-4 text-gray-600 bg-gray-50 py-2 rounded-r" {...props} />,
              code: ({node, ...props}) => <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono text-red-600" {...props} />,
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default MarkdownPreview;