import 'server-only';

// The one place a signed contract becomes a stamped one. Used by the "Apply
// company stamp" action and by downloads that stamp missing copies on the fly,
// so both produce the same file under the same name.

import { getProjectName, updateContract, INTAKE_PROJECT_NAME } from '@/lib/crew-db';
import { downloadFromDrive, resolveCrewFolder, uploadToFolder } from '@/lib/drive';
import { applyStampToPdf } from '@/lib/stamp';
import type { ContractType, CrewMember } from '@/lib/types';

export interface StampedCopy {
  pdf: Uint8Array;
  /** Drive link, when the stamped copy was filed. */
  link?: string;
}

/**
 * Stamp the signed copies of `types` for one crew member. Contracts that are
 * not signed are left out of the result. With `save`, each stamped PDF is
 * filed in the crew member's Contracts folder and its link recorded.
 */
export async function stampSignedContracts(
  crewId: string,
  crew: CrewMember,
  types: ContractType[],
  stampPng: Uint8Array,
  { save, onlyMissing = false }: { save: boolean; onlyMissing?: boolean },
): Promise<Partial<Record<ContractType, StampedCopy>>> {
  const out: Partial<Record<ContractType, StampedCopy>> = {};
  const first = crew.personal.firstName;
  const last = crew.personal.lastName;
  let contractsId: string | undefined;

  for (const type of types) {
    const signature = type === 'X' ? crew.signatures?.contractX : crew.signatures?.contractY;
    if (!signature?.signed || !signature.driveFileId) continue;
    if (onlyMissing && (type === 'X' ? crew.contract?.stampLinkX : crew.contract?.stampLinkY)) {
      continue;
    }

    const signed = await downloadFromDrive(signature.driveFileId);
    const pdf = await applyStampToPdf(new Uint8Array(signed), stampPng);
    const copy: StampedCopy = { pdf };

    if (save) {
      if (!contractsId) {
        const folders = await resolveCrewFolder({
          projectName: await getProjectName(crew.projectId),
          crewName: `${first} ${last}`.trim(),
          legacyProjectNames: [INTAKE_PROJECT_NAME],
        });
        contractsId = folders.contractsId;
      }
      const up = await uploadToFolder({
        folderId: contractsId,
        fileName: `Contract - ${first} - ${last} - ${type === 'X' ? 'A' : 'R'} - stamped.pdf`,
        mimeType: 'application/pdf',
        data: pdf,
      });
      copy.link = up.webViewLink;
    }
    out[type] = copy;
  }

  const links = {
    ...(out.X?.link ? { stampLinkX: out.X.link } : {}),
    ...(out.Y?.link ? { stampLinkY: out.Y.link } : {}),
  };
  if (Object.keys(links).length) {
    await updateContract(crewId, { ...links, stampedAt: Date.now() });
  }
  return out;
}
