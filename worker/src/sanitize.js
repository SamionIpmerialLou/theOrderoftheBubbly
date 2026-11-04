import sanitizeHtml from 'sanitize-html';

const options = {
  allowedTags: [
    'p', 'div', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'ul', 'ol', 'li', 'blockquote', 'a', 'h3', 'h4', 'code', 'pre', 'hr', 'span'
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel']
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        target: '_blank',
        rel: 'noopener noreferrer'
      }
    })
  }
};

export function sanitizeStateHtml(state) {
  return {
    ...state,
    decrees: state.decrees.map((decree) => ({
      ...decree,
      contentHtml: sanitizeHtml(decree.contentHtml || '', options)
    }))
  };
}
