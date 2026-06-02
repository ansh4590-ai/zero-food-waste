import React, { useCallback } from "react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ShieldCheck, UserCheck, FileText } from "lucide-react";
import { RoleGate } from "../auth/RoleGate";
import { getAutoStatusLabel, getKycRiskLevel } from "../../lib/kycEngine";
import { formatWaitTime, getFaceMatchColor, getAutoStatusBadgeClasses } from "../../lib/adminUtils";
import type { KycProfile } from "../../types/admin";

interface VerificationQueueRowProps {
  user: KycProfile;
  onSelect: (user: KycProfile) => void;
}

const VerificationQueueRow: React.FC<VerificationQueueRowProps> = React.memo(
  function VerificationQueueRow({ user, onSelect }) {
    const risk = getKycRiskLevel(user.kyc_score ?? 0);

    const handleSelect = useCallback(() => {
      onSelect(user);
    }, [onSelect, user]);

    return (
      <tr className="hover:bg-muted/40 dark:hover:bg-muted/10 transition-colors">
        {/* Volunteer Name */}
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
              {user.full_name?.charAt(0) || <UserCheck className="h-4 w-4" />}
            </div>
            <div>
              <div className="text-sm font-medium flex items-center gap-1">
                {user.full_name || 'Applicant'}
                {user.verification_status === 'approved' && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
              </div>
              <div className="text-[11px] text-muted-foreground">{user.role || 'volunteer'}</div>
            </div>
          </div>
        </td>

        {/* Docs */}
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="text-xs text-foreground flex items-center gap-1">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            {user.documents?.aadhaar ? "Attached" : "Missing"}
          </div>
        </td>

        {/* Extracted Data */}
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="text-xs text-foreground flex flex-col">
            <span>{user.extracted_data?.name || "—"}</span>
            <span className="text-muted-foreground text-[10px]">{user.extracted_data?.aadhaar || "—"}</span>
          </div>
        </td>

        {/* KYC Score */}
        <td className="px-4 py-3 whitespace-nowrap text-center">
          <div className="inline-flex flex-col items-center">
            <span className="text-sm font-bold" style={{ color: risk.color }}>{user.kyc_score ?? '—'}</span>
            <span className="text-[9px] font-medium" style={{ color: risk.color }}>{risk.label}</span>
          </div>
        </td>

        {/* Face Match */}
        <td className="px-4 py-3 whitespace-nowrap text-center">
          <span className={`text-sm font-semibold ${getFaceMatchColor(user.face_match_score ?? 0)}`}>
            {user.face_match_score != null ? `${user.face_match_score.toFixed(1)}%` : '—'}
          </span>
        </td>

        {/* AI Decision */}
        <td className="px-4 py-3 whitespace-nowrap text-center">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getAutoStatusBadgeClasses(user.kyc_auto_status)}`}>
            {getAutoStatusLabel(user.kyc_auto_status ?? 'pending')}
          </span>
        </td>

        {/* Status */}
        <td className="px-4 py-3 whitespace-nowrap text-center">
          <Badge variant={
            user.verification_status === 'approved' ? 'success' :
            user.verification_status === 'rejected' ? 'destructive' : 'warning'
          }>
            {user.verification_status || 'Pending'}
          </Badge>
        </td>

        {/* Wait Time */}
        <td className="px-4 py-3 whitespace-nowrap text-center">
          <div className="text-xs text-muted-foreground">
            {formatWaitTime(user.kyc_submitted_at)}
          </div>
        </td>

        {/* Action */}
        <td className="px-4 py-3 whitespace-nowrap text-right">
          <RoleGate permission="users.verify" fallback={<span className="text-muted-foreground text-xs">Restricted</span>}>
            <Button size="sm" variant={user.verification_status === 'pending' ? 'default' : 'outline'} onClick={handleSelect}>
              {user.verification_status === 'pending' ? 'Review' : 'View'}
            </Button>
          </RoleGate>
        </td>
      </tr>
    );
  }
);

export default VerificationQueueRow;
