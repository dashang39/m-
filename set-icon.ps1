param([string]$Exe, [string]$Ico)

$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;

public class IcoUpdater
{
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr BeginUpdateResource(string pFileName, bool bDeleteExistingResources);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool UpdateResource(IntPtr hUpdate, IntPtr lpType, IntPtr lpName, ushort wLanguage, byte[] lpData, uint cbData);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool EndUpdateResource(IntPtr hUpdate, bool fDiscard);

    public static string Apply(string exePath, string icoPath)
    {
        byte[] ico = File.ReadAllBytes(icoPath);
        int count = BitConverter.ToUInt16(ico, 4);
        var ids = new List<Tuple<int, int, byte[]>>(); // id, size, bytes
        var groupEntries = new List<byte[]>();

        for (int i = 0; i < count; i++)
        {
            int off = 6 + i * 16;
            byte iw = ico[off], ih = ico[off + 1], cc = ico[off + 2], rsv = ico[off + 3];
            ushort planes = BitConverter.ToUInt16(ico, off + 4);
            ushort bpp = BitConverter.ToUInt16(ico, off + 6);
            int size = BitConverter.ToInt32(ico, off + 8);
            int dataOff = BitConverter.ToInt32(ico, off + 12);
            byte[] data = new byte[size];
            Array.Copy(ico, dataOff, data, 0, size);
            int id = i + 1;
            ids.Add(Tuple.Create(id, size, data));

            var ge = new byte[14];
            ge[0] = iw; ge[1] = ih; ge[2] = cc; ge[3] = rsv;
            BitConverter.GetBytes(planes).CopyTo(ge, 4);
            BitConverter.GetBytes(bpp).CopyTo(ge, 6);
            BitConverter.GetBytes(size).CopyTo(ge, 8);
            BitConverter.GetBytes((ushort)id).CopyTo(ge, 12);
            groupEntries.Add(ge);
        }

        var grp = new List<byte>();
        grp.AddRange(BitConverter.GetBytes((ushort)0));
        grp.AddRange(BitConverter.GetBytes((ushort)1));
        grp.AddRange(BitConverter.GetBytes((ushort)count));
        foreach (var g in groupEntries) grp.AddRange(g);
        byte[] groupData = grp.ToArray();

        IntPtr h = BeginUpdateResource(exePath, false);
        if (h == IntPtr.Zero) return "BeginUpdateResource failed: " + Marshal.GetLastWin32Error();

        var RT_ICON = new IntPtr(3);
        var RT_GROUP = new IntPtr(14);
        foreach (var item in ids)
        {
            if (!UpdateResource(h, RT_ICON, new IntPtr(item.Item1), 0, item.Item3, (uint)item.Item3.Length))
            {
                int err = Marshal.GetLastWin32Error();
                EndUpdateResource(h, true);
                return "UpdateResource ICON failed id=" + item.Item1 + " err=" + err;
            }
        }
        if (!UpdateResource(h, RT_GROUP, new IntPtr(1), 0, groupData, (uint)groupData.Length))
        {
            int err = Marshal.GetLastWin32Error();
            EndUpdateResource(h, true);
            return "UpdateResource GROUP failed err=" + err;
        }
        bool ok = EndUpdateResource(h, false);
        return ok ? "OK" : ("EndUpdateResource failed err=" + Marshal.GetLastWin32Error());
    }
}
"@

$r = [IcoUpdater]::Apply($Exe, $Ico)
Write-Host "icon: $r"
