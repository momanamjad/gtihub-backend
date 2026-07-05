import FileNode from '../models/fileNode.js';

/**
 * Generates conflict markers for differing lines between target and source content.
 */
export const generateConflictContent = (targetContent, sourceContent, targetBranch, sourceBranch) => {
  const targetLines = (targetContent || '').split(/\r?\n/);
  const sourceLines = (sourceContent || '').split(/\r?\n/);
  
  const hasLinesInCommon = targetLines.some(line => line.trim() && sourceLines.map(l => l.trim()).includes(line.trim()));
  
  if (!hasLinesInCommon) {
    return `<<<<<<< ${targetBranch}\n${targetContent}\n=======\n${sourceContent}\n>>>>>>> ${sourceBranch}\n`;
  }
  
  let result = [];
  let i = 0;
  let j = 0;
  
  while (i < targetLines.length || j < sourceLines.length) {
    if (i < targetLines.length && j < sourceLines.length && targetLines[i] === sourceLines[j]) {
      result.push(targetLines[i]);
      i++;
      j++;
    } else {
      // Collect mismatched block
      let targetBlock = [];
      let sourceBlock = [];
      
      let foundMatch = false;
      let matchI = i;
      let matchJ = j;
      
      // Look ahead for next matching lines
      for (let ti = i; ti < targetLines.length && !foundMatch; ti++) {
        for (let sj = j; sj < sourceLines.length && !foundMatch; sj++) {
          if (targetLines[ti] === sourceLines[sj] && targetLines[ti].trim() !== '') {
            matchI = ti;
            matchJ = sj;
            foundMatch = true;
          }
        }
      }
      
      if (foundMatch) {
        targetBlock = targetLines.slice(i, matchI);
        sourceBlock = sourceLines.slice(j, matchJ);
        i = matchI;
        j = matchJ;
      } else {
        targetBlock = targetLines.slice(i);
        sourceBlock = sourceLines.slice(j);
        i = targetLines.length;
        j = sourceLines.length;
      }
      
      result.push(`<<<<<<< ${targetBranch}`);
      if (targetBlock.length > 0) result.push(targetBlock.join('\n'));
      result.push(`=======`);
      if (sourceBlock.length > 0) result.push(sourceBlock.join('\n'));
      result.push(`>>>>>>> ${sourceBranch}`);
    }
  }
  
  return result.join('\n');
};

/**
 * Checks for conflicts between head and base branch files.
 * Returns { hasConflicts: boolean, conflictedFiles: string[] }
 */
export const checkBranchesForConflicts = async (repoId, sourceBranch, targetBranch) => {
  const buildQuery = (branchName) => {
    const query = { repository: repoId, type: 'file' };
    if (branchName === 'main') {
      query.$or = [{ branch: 'main' }, { branch: { $exists: false } }, { branch: null }];
    } else {
      query.branch = branchName;
    }
    return query;
  };

  const sourceFiles = await FileNode.find(buildQuery(sourceBranch)).lean();
  const targetFiles = await FileNode.find(buildQuery(targetBranch)).lean();

  const sourceMap = new Map(sourceFiles.map(f => [f.path, f]));
  const conflictedFiles = [];

  for (const targetFile of targetFiles) {
    const sourceFile = sourceMap.get(targetFile.path);
    // If the file exists on both branches, has different content, and isn't identical
    if (sourceFile && sourceFile.content !== targetFile.content) {
      conflictedFiles.push(targetFile.path);
    }
  }

  return {
    hasConflicts: conflictedFiles.length > 0,
    conflictedFiles
  };
};
