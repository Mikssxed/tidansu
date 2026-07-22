namespace Tidansu.Domain.Interfaces;

/// <summary>
/// Mints an unforgeable <c>Space.Id</c> (B-23). Callers depend on "give me an
/// unforgeable id", not on how it is produced — the implementation (Infrastructure)
/// is free to choose the CSPRNG/encoding as long as the result is unpredictable,
/// globally unique in practice, and fits the <c>Spaces.Id</c> column
/// (<c>nvarchar(64)</c>, see <c>TidansuDbContext</c>).
/// </summary>
public interface ISpaceIdGenerator
{
    string Generate();
}
