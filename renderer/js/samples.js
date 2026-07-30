/* Sample diagrams + the demo Markdown document.
 * Every string is valid Mermaid v11 syntax. */
'use strict';

window.SAMPLES = (() => {

  const carbonCycle = `---
config:
  look: handDrawn
  theme: neutral
---
flowchart TD
    A["CO₂ in the atmosphere"] -->|absorbed by| B["Oceans"]
    A -->|photosynthesis| C["Plants & forests"]
    B --> D["Marine life & shells"]
    D --> E["Ocean sediments"]
    E -->|over millennia| F["Fossil fuels"]
    F -->|burned by humans| A
    C -->|respiration| A
    C -->|decomposition| G["Soil carbon"]
    G --> A
    classDef sky fill:#dcecef,stroke:#96c9d6,color:#111
    classDef pink fill:#fde7f0,stroke:#e0095f,color:#111
    classDef dark fill:#2c2350,stroke:#2c2350,color:#fff
    class A,C pink
    class B,D,E sky
    class F dark`;

  const sequence = `sequenceDiagram
    autonumber
    actor U as User
    participant A as App
    participant S as Auth Server
    participant DB as Database

    U->>+A: Enter credentials
    A->>+S: POST /login
    S->>DB: Lookup user
    DB-->>S: user record
    alt valid credentials
        S-->>A: 200 OK + JWT
        A-->>U: Redirect to dashboard
    else invalid
        S-->>-A: 401 Unauthorized
        A-->>-U: Show error message
    end
    Note over U,DB: Login happens once per session`;

  const classDiagram = `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound() void
        +move() void
    }
    class Dog {
        +String breed
        +fetch() void
    }
    class Cat {
        +bool indoor
        +purr() void
    }
    class Owner {
        +String name
        +adopt(Animal) void
    }
    Animal <|-- Dog
    Animal <|-- Cat
    Owner "1" --> "*" Animal : owns`;

  const state = `stateDiagram-v2
    direction LR
    [*] --> Draft
    Draft --> InReview : submit
    InReview --> Draft : request changes
    InReview --> Approved : approve
    InReview --> Rejected : reject
    Approved --> Published : publish
    Rejected --> [*]
    Published --> Archived : archive
    Archived --> [*]`;

  const er = `erDiagram
    USER ||--o{ POST : writes
    USER ||--o{ COMMENT : writes
    POST ||--o{ COMMENT : has
    POST }o--o{ TAG : "tagged with"
    USER {
        int id PK
        string name
        string email
    }
    POST {
        int id PK
        string title
        text body
        date published_at
    }
    COMMENT {
        int id PK
        text body
    }
    TAG {
        int id PK
        string label
    }`;

  const gantt = `gantt
    title Product launch plan
    dateFormat YYYY-MM-DD
    excludes weekends

    section Discovery
    User research           :done,    des1, 2026-01-05, 10d
    Competitive analysis    :done,    des2, after des1, 5d

    section Design
    Wireframes              :active,  des3, 2026-01-26, 8d
    Visual design           :         des4, after des3, 8d

    section Build
    Core editor             :         dev1, after des4, 15d
    Renderer hardening      :         dev2, after dev1, 8d

    section Ship
    Beta testing            :         b1, after dev2, 7d
    Launch                  :milestone, after b1, 0d`;

  const pie = `pie showData
    title How the community diagrams
    "Flowcharts" : 386
    "Sequence diagrams" : 264
    "ER diagrams" : 141
    "Gantt charts" : 119
    "Everything else" : 90`;

  const journey = `journey
    title A reader's afternoon
    section Discover
      Finds a .mmd file in a repo: 3: Reader
      Drags it onto the app: 5: Reader
    section Explore
      Zooms and pans the diagram: 5: Reader
      Tweaks a label in code: 4: Reader
    section Share
      Exports a crisp SVG: 5: Reader
      Pastes the link in chat: 4: Reader`;

  const mindmap = `mindmap
  root((Launch ideas))
    Channels
      Design communities
          Dribbble
          Figma plugins
      Developer hubs
          GitHub
          Hacker News
    Content
      Tweet-sized diagrams
      Short demo videos
    Timing
      Tease in week one
      Launch on a Tuesday
      Follow-up post
    Risks
      Crowded market
      Holiday slowdown`;

  const timeline = `timeline
    title Bootstrapped startup roadmap
    2024 : Idea scribbled in a notebook
         : First prototype in a weekend
    2025 : Private beta
         : 1,000 users
         : First revenue
    2026 : Desktop app ships
         : 50,000 users
         : Series seed`;

  const gitgraph = `gitGraph
    commit id: "init"
    commit id: "docs"
    branch develop
    commit id: "editor"
    commit id: "preview"
    branch feature/export
    commit id: "png"
    commit id: "svg"
    checkout develop
    merge feature/export id: "export ✓" tag: "v0.9"
    checkout main
    merge develop id: "release" tag: "v1.0"`;

  const quadrant = `quadrantChart
    title Diagram tools landscape
    x-axis "Low code" --> "Code-first"
    y-axis "Static" --> "Interactive"
    quadrant-1 "Power users"
    quadrant-2 "Automate more"
    quadrant-3 "Occasional"
    quadrant-4 "Quick sketches"
    "Mermaid Reader": [0.82, 0.78]
    "Image editors": [0.15, 0.30]
    "Whiteboards": [0.30, 0.85]
    "Graphviz": [0.90, 0.22]
    "Slide decks": [0.12, 0.18]`;

  const block = `block-beta
    columns 3
    a["Client"]:3
    block: services:3
        columns 2
        b["API"] c["Worker"]
    end
    d[("Database")]
    s3[("Storage")]
    queue{{"Queue"}}
    a --> b
    b --> queue
    queue --> c
    c --> d
    b --> s3`;

  const architecture = `architecture-beta
    group edge(cloud)[Edge]
    group core(cloud)[Core platform]

    service cdn(internet)[CDN] in edge
    service web(server)[Web app] in core
    service api(server)[API] in core
    service db(database)[Postgres] in core
    service cache(database)[Cache] in core

    cdn:R --> L:web
    web:B --> T:api
    api:R --> L:db
    api:B --> T:cache`;

  const orgChart = `flowchart TD
    CEO["Founder & CEO"]
    CEO --> CTO["CTO"]
    CEO --> COO["COO"]
    CTO --> FE["Frontend guild"]
    CTO --> BE["Backend guild"]
    CTO --> DX["DevEx"]
    COO --> OPS["Operations"]
    COO --> FIN["Finance"]
    classDef lead fill:#2c2350,stroke:#2c2350,color:#fff
    classDef team fill:#dcecef,stroke:#96c9d6,color:#111
    class CEO lead
    class CTO,COO pinkish
    class FE,BE,DX,OPS,FIN team
    classDef pinkish fill:#fde7f0,stroke:#e0095f,color:#111`;

  const markdownDemo = `# Mermaid Reader — field guide

Open **any** Markdown file and read it as a typeset document. Every
\`mermaid\` fence is rendered **inline**, like this one:

\`\`\`mermaid
flowchart LR
    Write([Write]) --> Preview([Preview]) --> Export([Export])
    Export -->|png| Slides{{Slides}}
    Export -->|svg| Wiki{{Wiki}}
\`\`\`

## Why text-first diagrams?

1. **Diffable** — a diagram change is a one-line \`git diff\`.
2. **Reviewable** — PRs can discuss the shape of a system.
3. **Embeddable** — they render in GitHub, Notion, and here.

> “A diagram is worth a thousand meetings.”
> — every tech lead, eventually

## Supported fence content

| Diagram   | Since | Fence type  |
| --------- | ----- | ----------- |
| Flowchart | 8.x   | flowchart   |
| Sequence  | 8.x   | sequenceDiagram |
| Mindmap   | 9.3   | mindmap     |
| Timeline  | 10.x  | timeline    |

- [x] Drag & drop files
- [x] Pan / zoom the canvas
- [x] Export SVG & PNG
- [ ] Take over the world

### A sequence worth a thousand log files

\`\`\`mermaid
sequenceDiagram
    participant F as File
    participant R as Reader
    participant V as View
    F->>R: .md dropped
    R->>R: detect & parse
    R->>V: render blocks
    V-->>R: painted in 12ms
\`\`\`

## Closing note

Press \`Ctrl/Cmd + O\` to open another file, or \`Shift + Ctrl/Cmd + C\`
to copy the diagram as an image. Happy diagramming!
`;

  const basic = `flowchart TD
    A(["Start"]) --> B{"Is it a Mermaid file?"}
    B -- "Yes" --> C["Render diagram"]
    B -- "No, it's Markdown" --> D["Render document + inline diagrams"]
    C --> E(["Pan, zoom, export"])
    D --> E`;

  const SAMPLES = {
    flowchart:   { label: 'Flowchart',        code: carbonCycle },
    sequence:    { label: 'Sequence diagram', code: sequence },
    class:       { label: 'Class diagram',    code: classDiagram },
    state:       { label: 'State diagram',    code: state },
    er:          { label: 'ER diagram',       code: er },
    gantt:       { label: 'Gantt chart',      code: gantt },
    pie:         { label: 'Pie chart',        code: pie },
    journey:     { label: 'User journey',     code: journey },
    mindmap:     { label: 'Mind map',         code: mindmap },
    timeline:    { label: 'Timeline',         code: timeline },
    gitgraph:    { label: 'Git graph',        code: gitgraph },
    quadrant:    { label: 'Quadrant chart',   code: quadrant },
    block:       { label: 'Block diagram',    code: block },
    architecture:{ label: 'Architecture',     code: architecture },
    org:         { label: 'Org chart',        code: orgChart },
    basic:       { label: 'Starter flow',     code: basic },
    markdown:    { label: 'Markdown document', code: markdownDemo, kind: 'markdown' }
  };

  /* "What do you need to figure out?" — chips on the home page, mapped 1:1
   * to the phrasing used on mermaid.ai */
  const PROMPT_CHIPS = [
    { label: 'Plan my project',            sample: 'gantt' },
    { label: 'Organize my thoughts',       sample: 'mindmap' },
    { label: 'Explain a complex idea',     sample: 'flowchart' },
    { label: 'Design a system',            sample: 'architecture' },
    { label: 'Map out my team',            sample: 'org' },
    { label: 'Brainstorm ideas',           sample: 'mindmap' },
    { label: 'Show my startup roadmap',    sample: 'timeline' },
    { label: 'Design a database',          sample: 'er' },
    { label: 'Teach a lesson',             sample: 'flowchart' },
    { label: 'Show system interactions',   sample: 'sequence' },
    { label: 'Model object structures',    sample: 'class' },
    { label: 'Lay out events in order',    sample: 'timeline' }
  ];

  const TYPE_CHIPS = [
    'flowchart', 'sequence', 'gantt', 'er', 'timeline', 'mindmap', 'org',
    'block', 'state', 'gitgraph', 'journey', 'class', 'pie', 'quadrant'
  ];

  const MARQUEE = [
    'Developers', 'Data Engineers', 'Analysts', 'Visual Thinkers', 'Educators',
    'Consultants', 'Business Strategists', 'Documentation Specialists',
    'Product Thinkers', 'Technical Writers', 'Operations Leads', 'Project Managers',
    'Designers'
  ];

  return { SAMPLES, PROMPT_CHIPS, TYPE_CHIPS, MARQUEE, DEFAULT: carbonCycle };
})();
