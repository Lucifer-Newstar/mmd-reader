/* A compact CodeMirror 5 mode for Mermaid syntax — keywords, diagram types,
 * arrows, strings, comments, numbers, and front-matter directives. */
'use strict';

(function () {
  const DIAGRAM_TYPES = [
    'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'classDiagram-v2',
    'stateDiagram', 'stateDiagram-v2', 'erDiagram', 'gantt', 'pie', 'journey',
    'mindmap', 'timeline', 'gitGraph', 'quadrantChart', 'xychart-beta',
    'block-beta', 'architecture-beta', 'sankey-beta', 'radar-beta', 'C4Context',
    'requirementDiagram', 'kanban', 'packet-beta', 'zenuml'
  ];

  const KEYWORDS = [
    'direction', 'subgraph', 'end', 'class', 'classDef', 'style', 'linkStyle',
    'click', 'callback', 'default', 'participant', 'actor', 'as', 'autonumber',
    'activate', 'deactivate', 'note', 'Note', 'loop', 'alt', 'else', 'opt',
    'par', 'and', 'critical', 'option', 'break', 'rect', 'box', 'create',
    'destroy', 'section', 'title', 'dateFormat', 'axisFormat', 'excludes',
    'includes', 'todayMarker', 'weekday', 'showData', 'commit', 'branch',
    'checkout', 'merge', 'cherry-pick', 'columns', 'group', 'service', 'in',
    'junction', 'db', 'disk', 'person', 'system', 'systemDb', 'systemQueue',
    'boundary', 'container', 'containerDb', 'component', 'quadrant',
    'x-axis', 'y-axis', 'quadrant-1', 'quadrant-2', 'quadrant-3', 'quadrant-4',
    'if', 'description', 'keys', 'bar', 'line', 'left', 'right', 'center'
  ];

  const ATOMS = ['true', 'false', 'none', 'PK', 'FK', 'UK'];

  const kwMap = Object.create(null);
  DIAGRAM_TYPES.forEach((k) => (kwMap[k] = 'keyword'));
  KEYWORDS.forEach((k) => (kwMap[k] = 'cm-class'));
  ATOMS.forEach((k) => (kwMap[k] = 'atom'));

  CodeMirror.defineMode('mermaid', function () {
    return {
      startState: () => ({ inDirective: false }),

      token(stream, state) {
        if (stream.sol()) state.inDirective = false;

        if (stream.eatSpace()) return null;

        /* %% comment */
        if (stream.match(/^%%({.*?})?.*$/)) return 'comment';

        /* front-matter directives --- */
        if (stream.sol() && stream.match(/^---\s*$/)) return 'cm-dir';

        /* strings */
        if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return 'string';
        if (stream.match(/^'(?:[^'\\]|\\.)*'?/)) return 'string';

        /* arrows & edges */
        if (stream.match(/^(?:x|o)?--?(?:>|x|o)(?:\|[^^|]*\|)?|^(?:<)?-{2,3}(?:>|x|o)|^===>?|^\.?\.->|^-\.-|--\[|==\[|^\|[^|]*\|/)) return 'cm-arrow';
        if (stream.match(/^(?:==|~~|--|\.\.)\>?/)) return 'cm-arrow';

        /* node-shape brackets and structural punctuation */
        if (stream.match(/^[\[\]\(\){}<>;]/)) return 'cm-arrow';

        /* numbers */
        if (stream.match(/^\d+(\.\d+)?/)) return 'number';

        /* words */
        if (stream.match(/^[A-Za-z$_][\w$-]*/)) {
          const word = stream.current();
          if (state.inDirective || stream.peek() === ':') return 'cm-dir';
          const cls = kwMap[word];
          return cls || 'cm-id';
        }

        stream.next();
        return null;
      },

      /* simple config: front matter word: value colouring */
      token2: null
    };
  });

  CodeMirror.defineMIME('text/x-mermaid', 'mermaid');
})();
