import type { Components } from 'react-markdown';

export const mdComponents: Components = {
  code({ className, children, ...props }) {
    const isBlock = className?.startsWith('language-');
    if (isBlock) {
      return (
        <pre className="bg-gray-950 border border-gray-700 rounded-md p-3 my-2 overflow-x-auto">
          <code className={`text-green-300 text-xs font-mono leading-relaxed ${className ?? ''}`} {...props}>
            {children}
          </code>
        </pre>
      );
    }
    return (
      <code className="bg-gray-950 text-green-300 text-xs font-mono px-1 py-0.5 rounded" {...props}>
        {children}
      </code>
    );
  },
  p({ children }) { return <p className="text-gray-200 text-sm leading-relaxed mb-2">{children}</p>; },
  ul({ children }) { return <ul className="list-disc list-inside space-y-1 my-2 text-sm text-gray-200">{children}</ul>; },
  ol({ children }) { return <ol className="list-decimal list-inside space-y-1 my-2 text-sm text-gray-200">{children}</ol>; },
  li({ children }) { return <li className="text-gray-200 text-sm">{children}</li>; },
  h1({ children }) { return <h1 className="text-white font-bold text-base mb-2">{children}</h1>; },
  h2({ children }) { return <h2 className="text-white font-semibold text-sm mb-1 mt-3">{children}</h2>; },
  h3({ children }) { return <h3 className="text-gray-300 font-semibold text-xs mb-1 mt-2">{children}</h3>; },
  blockquote({ children }) {
    return <blockquote className="border-l-2 border-indigo-500 pl-3 my-2 text-gray-400 italic text-sm">{children}</blockquote>;
  },
};
