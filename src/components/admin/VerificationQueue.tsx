import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { ShieldCheck, RefreshCw, Loader2 } from "lucide-react";
import VerificationQueueRow from "./VerificationQueueRow";
import type { KycProfile } from "../../types/admin";

interface VerificationQueueProps {
  users: KycProfile[];
  isLoading: boolean;
  onRefresh: () => void;
  onSelectUser: (user: KycProfile) => void;
}

export default function VerificationQueue({ users, isLoading, onRefresh, onSelectUser }: VerificationQueueProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-info" />
            Priority Verification Queue
          </CardTitle>
          <CardDescription>Sorted by risk score — lowest confidence first. AI decisions can be overridden.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto border rounded-xl">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50 dark:bg-muted/20">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Volunteer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Docs</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Extracted Data</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase">KYC Score</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase">Face Match</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase">AI Decision</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase">Wait</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-card text-card-foreground divide-y divide-border">
                {users.map((user) => (
                  <VerificationQueueRow key={user.id} user={user} onSelect={onSelectUser} />
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-muted-foreground">
                      No verification requests found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
