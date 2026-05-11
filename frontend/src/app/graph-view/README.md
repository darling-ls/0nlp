# Graph view component

This folder contains the Angular + D3 force-directed dependency graph component.

## Expected data location

The component loads:

- `assets/graph_data.json`

So copy the ETL output:

- from `data/processed/graph_data.json`
- to `frontend/src/assets/graph_data.json`

## Integration steps (existing Angular app)

### 1) Install dependencies

Install D3:

```bash
npm install d3
```

### 2) Add the component files

Copy these files into your Angular app (same folder name recommended):
- `graph-view.component.ts`
- `graph-view.component.html`

### 3) Enable HTTP loading of `assets/graph_data.json`

Ensure `HttpClientModule` is imported in your app module (Angular < 15) or in your bootstrap (standalone apps).

Example (NgModule apps) in `frontend/src/app/app.module.ts`:

```ts
import { HttpClientModule } from '@angular/common/http';

@NgModule({
  imports: [HttpClientModule],
})
export class AppModule {}
```

### 4) Declare/use the component

If you use NgModules, declare the component in the module where you want it.

Then render it from a page:

```html
<app-graph-view></app-graph-view>
```

### 5) Run the app (headless server)

Bind to all interfaces so you can access it remotely:

```bash
ng serve --host 0.0.0.0 --port 4200
```

Open from your laptop:
- `http://<server-ip>:4200`

Tip: if you do not want to expose port `4200`, use SSH port forwarding:

```bash
ssh -L 4200:localhost:4200 <user>@<server-ip>
```

Then open:
- `http://localhost:4200`
