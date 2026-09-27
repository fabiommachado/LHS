using System.Security.Cryptography;
using System.Text.Json;
using Lhs.Candidates.Api.Models;

namespace Lhs.Candidates.Api.Infrastructure;

/// <summary>
/// AES-256-GCM encryption of bank details (req 3.1.3, 3.10.2). The key comes from configuration
/// (BankEncryption:Key, base64 of 32 bytes) – user secrets in development, a key vault in production. Never commit it.
/// </summary>
public sealed class BankCrypto
{
    public const short KeyVersion = 1;
    private const int NonceSize = 12, TagSize = 16;
    private readonly byte[] _key;

    public BankCrypto(IConfiguration config)
    {
        var b64 = config["BankEncryption:Key"];
        if (string.IsNullOrWhiteSpace(b64))
            throw new InvalidOperationException(
                "BankEncryption:Key is not configured. For development run: " +
                "dotnet user-secrets set BankEncryption:Key <base64 of 32 random bytes>");
        _key = Convert.FromBase64String(b64);
        if (_key.Length != 32) throw new InvalidOperationException("BankEncryption:Key must be 32 bytes (AES-256).");
    }

    public (byte[] Nonce, byte[] CiphertextWithTag) Encrypt(BankDetails details)
    {
        var plain = JsonSerializer.SerializeToUtf8Bytes(details);
        var nonce = RandomNumberGenerator.GetBytes(NonceSize);
        var output = new byte[plain.Length + TagSize];
        using var aes = new AesGcm(_key, TagSize);
        aes.Encrypt(nonce, plain, output.AsSpan(0, plain.Length), output.AsSpan(plain.Length));
        CryptographicOperations.ZeroMemory(plain);
        return (nonce, output);
    }

    public BankDetails Decrypt(byte[] nonce, byte[] ciphertextWithTag)
    {
        var len = ciphertextWithTag.Length - TagSize;
        var plain = new byte[len];
        using var aes = new AesGcm(_key, TagSize);
        aes.Decrypt(nonce, ciphertextWithTag.AsSpan(0, len), ciphertextWithTag.AsSpan(len), plain);
        try { return JsonSerializer.Deserialize<BankDetails>(plain)!; }
        finally { CryptographicOperations.ZeroMemory(plain); }
    }
}
