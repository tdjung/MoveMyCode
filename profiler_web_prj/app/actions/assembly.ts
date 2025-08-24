'use server';

import { exec } from 'child_process';
import { promisify } from 'util';
import { AssemblyData, AssemblyInstruction } from '@/types/profiler';

const execAsync = promisify(exec);

export async function getAssemblyCode(
  objectFile: string,
  startAddress: string,
  endAddress: string
): Promise<AssemblyData | null> {
  try {
    // Validate input
    if (!objectFile || !startAddress || !endAddress) {
      console.error('Missing required parameters:', { objectFile, startAddress, endAddress });
      return null;
    }

    // Check if file exists and is readable
    try {
      await execAsync(`test -r "${objectFile}"`);
    } catch (error) {
      // Silently fail without logging to console
      throw new Error(`Cannot access file: ${objectFile}. Please check file permissions.`);
    }

    // Construct objdump command with proper escaping
    const command = `objdump -C -d --start-address=${startAddress} --stop-address=${endAddress} "${objectFile}"`;
    
    // console.log('Executing objdump command:', command);
    
    try {
      const { stdout, stderr } = await execAsync(command, { maxBuffer: 1024 * 1024 * 10 }); // 10MB buffer
      
      if (stderr) {
        console.error('objdump stderr:', stderr);
        if (stderr.includes('Permission denied')) {
          throw new Error('Permission denied: Cannot read the object file. Please check file permissions.');
        }
        if (stderr.includes('File format not recognized')) {
          throw new Error('Invalid file format: The specified file is not a valid object file.');
        }
      }
      
      if (!stdout || stdout.trim().length === 0) {
        console.warn('objdump returned empty output');
        return {
          startAddress,
          endAddress,
          instructions: []
        };
      }
      
      // Parse objdump output
      const instructions: AssemblyInstruction[] = [];
      const lines = stdout.split('\n');
      
      for (const line of lines) {
        // Match assembly instruction lines (e.g., "  401000:	55                   	push   %rbp")
        const match = line.match(/^\s*([0-9a-f]+):\s+(.+)$/);
        if (match) {
          const pc = '0x' + match[1];
          const instruction = match[2].trim();
          
          instructions.push({
            pc,
            instruction
          });
        }
      }

      return {
        startAddress,
        endAddress,
        instructions
      };
    } catch (execError: any) {
      // Log only error message, not full stack trace
      console.error('Error executing objdump:', execError.message || execError.code || 'Unknown error');
      if (execError.code === 'ENOENT') {
        throw new Error('objdump not found: Please ensure objdump is installed on your system.');
      }
      if (execError.message?.includes('Permission denied')) {
        throw new Error(`Permission denied when accessing ${objectFile}. Please check file permissions.`);
      }
      throw execError;
    }
  } catch (error: any) {
    // Don't log errors for files that don't exist (like ???, aa.c, etc.)
    // Only log errors for actual issues
    if (objectFile && !objectFile.includes('???') && !error.message?.includes('Cannot access file')) {
      console.error('Error getting assembly code:', error.message || 'Unknown error');
    }
    return null;
  }
}

export async function getAssemblyForFunction(
  objectFile: string,
  pcData: Record<string, any>
): Promise<AssemblyData | null> {
  if (!pcData || Object.keys(pcData).length === 0) {
    return null;
  }

  // Find PC range
  const pcs = Object.keys(pcData).map(pc => parseInt(pc, 16));
  const minPc = Math.min(...pcs);
  const maxPc = Math.max(...pcs);
  
  // Add some padding to ensure we get complete instructions
  const startAddress = '0x' + (minPc - 16).toString(16);
  const endAddress = '0x' + (maxPc + 64).toString(16);
  
  const assemblyData = await getAssemblyCode(objectFile, startAddress, endAddress);
  
  if (assemblyData) {
    // Map PC data to assembly instructions
    assemblyData.instructions.forEach(inst => {
      const pcInfo = pcData[inst.pc];
      if (pcInfo) {
        inst.events = pcInfo.events;
        inst.executed = pcInfo.executed;
      }
    });
  }
  
  return assemblyData;
}