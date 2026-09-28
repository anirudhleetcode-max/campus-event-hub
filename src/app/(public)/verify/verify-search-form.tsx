import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

/** Plain GET form (works without JavaScript): /verify?code=… redirects to /verify/<CODE>. */
export function VerifySearchForm({ defaultValue }: { defaultValue?: string }) {
  return (
    <form action="/verify" method="get" role="search" className="space-y-2">
      <Label htmlFor="certificate-code">Certificate ID</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="certificate-code"
          name="code"
          defaultValue={defaultValue}
          placeholder="CEH-2026-ABCD2345"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={32}
          required
          aria-describedby="certificate-code-hint"
          className="h-11 font-mono tracking-wide uppercase placeholder:normal-case"
        />
        <Button type="submit" size="lg" className="h-11">
          <Search aria-hidden /> Verify
        </Button>
      </div>
      <p id="certificate-code-hint" className="text-xs text-muted-foreground">
        Not case-sensitive. Spaces are ignored.
      </p>
    </form>
  );
}
