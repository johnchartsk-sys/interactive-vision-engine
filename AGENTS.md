<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep the command-center experience on the client-only home route; its WebGL viewer requires browser rendering.
- Use dedicated infrastructure panel and graphics components with global semantic design tokens; this keeps repeated sector controls consistent.
- Use CDN asset pointers for reference-image crops; media stays out of source control.
- Render NIA using the original portrait texture on a curved 3D relief with bounded orbit controls; this preserves its exact reference identity without inventing unseen facial views.
- Create intrinsic Three.js scene elements with React.createElement rather than JSX; preview source-selection attributes are DOM-only and crash R3F property updates.
- Keep command-center actions as explicit demonstration interactions until real services are connected; never imply live infrastructure data.
- NIA's AI only returns validated communication drafts; a dedicated confirmation card invokes sendCommunication, keeping generation separate from transmission.
- Store the explicit communication test-mode choice in browser storage, defaulting to simulation when no choice exists; reopening chat must not silently enable real sending.
