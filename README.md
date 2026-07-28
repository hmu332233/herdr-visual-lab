# Herdr Games

English | [한국어](./README.KR.md)

Herdr Games is a dashboard playground for experimenting with more entertaining
ways to watch coding agents work in Herdr.

It reimagines a single live session as different worlds—a galaxy, a race, a
raid, or a metro system. Build and compare modes to discover which views make
agent status and activity the most intuitive and enjoyable to follow.

## Getting Started

Requirements:

- Node.js 20 or later
- Herdr 0.7.4 or later

```sh
npm install
npm run build
npm link
herdr-games
```

Herdr Games opens `http://127.0.0.1:4158` in your default browser. Press
`Ctrl+C` in the terminal to stop it.

To preview the dashboard without Herdr, run it with a fixture:

```sh
herdr-games --fixture grid
```

Available options:

```text
herdr-games [options]

--port <n>        Set the starting port (default: 4158)
--no-open         Do not open the browser automatically
--socket <path>   Set the Herdr Unix socket path
--fixture <name>  Run with sample data
--speed <n>       Set the animation speed multiplier
```

Available fixtures are `grid`, `dense`, `redflag`, `error`, and `podium`.

## Modes

Choose a mode with the running server's `?game=` query parameter.

### Galaxy

The session becomes a galactic core, workspaces become stars, tabs become
planets, and agents become satellites. Galaxy is the default mode, so it also
opens when no query parameter is provided.

```text
http://127.0.0.1:4158/
http://127.0.0.1:4158/?game=galaxy
```

![Galaxy mode](./readme-assets/galaxy.gif)

### Raid 2

Agents battle a boss on a side-scrolling 2D battlefield with animated
characters.

```text
http://127.0.0.1:4158/?game=raid2
```

![Raid 2 mode](./readme-assets/raid2.gif)

### Raid

Workspaces become guilds, and agents become raiders attacking a boss.

```text
http://127.0.0.1:4158/?game=raid
```

![Raid mode](./readme-assets/raid.gif)

### Kanban

Agents appear in columns according to their `IDLE`, `WORKING`, `BLOCKED`, or
`DONE` status.

```text
http://127.0.0.1:4158/?game=kanban
```

![Kanban mode](./readme-assets/kanban.gif)

### F1

Workspaces become racing teams, and agents become cars driving around the
circuit.

```text
http://127.0.0.1:4158/?game=f1
```

![F1 mode](./readme-assets/f1.gif)

### Metro

Workspaces become subway lines, and agents become trains running through a
late-night city.

```text
http://127.0.0.1:4158/?game=metro
```

![Metro mode](./readme-assets/metro.gif)
