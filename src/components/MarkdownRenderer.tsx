import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-content text-xs text-gray-200 leading-relaxed space-y-2 font-sans">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-sm font-bold text-nexa-glow mt-3 mb-1.5 font-display tracking-tight border-b border-nexa-border/60 pb-1">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xs font-bold text-nexa-glow mt-3 mb-1.5 font-display tracking-tight border-b border-nexa-border/40 pb-1">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-semibold text-white mt-2 mb-1 font-display">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-xs text-gray-200 leading-relaxed mb-1.5 last:mb-0">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 my-2 text-xs text-gray-200 pl-1">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 my-2 text-xs text-gray-200 pl-1">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-xs text-gray-200 leading-relaxed">
              {children}
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-white">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-cyan-200">
              {children}
            </em>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-2.5 rounded-xl border border-nexa-border bg-[#0D1117] p-0.5">
              <table className="w-full text-left border-collapse text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#161B22] text-nexa-glow font-semibold border-b border-nexa-border">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-nexa-border/40">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-white/[0.02] transition">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="p-2 text-left font-mono text-[11px] uppercase tracking-wider text-gray-300">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="p-2 text-xs text-gray-200 font-sans">
              {children}
            </td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-nexa-blue pl-3 py-1 my-2 text-gray-300 italic bg-nexa-blue/5 rounded-r-lg">
              {children}
            </blockquote>
          ),
          code: ({ className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !String(children).includes('\n');
            return isInline ? (
              <code className="bg-[#1F2430] text-cyan-300 px-1.5 py-0.5 rounded font-mono text-[11px] border border-cyan-500/20" {...props}>
                {children}
              </code>
            ) : (
              <div className="my-2 rounded-xl bg-[#090C10] border border-nexa-border p-3 font-mono text-[11px] text-cyan-200 overflow-x-auto">
                <code>{children}</code>
              </div>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
