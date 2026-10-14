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
- Use CDN asset pointers for reference-image crops and the CC0 Poly Haven marble_bust_01 model; media stays out of source control.
- Keep command-center actions as explicit demonstration interactions until real services are connected; never imply live infrastructure data.
