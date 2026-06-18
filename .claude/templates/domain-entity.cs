// Template: Domain Entity
// Location: Tidansu.Domain/Entities/{EntityName}.cs
// Replace all {EntityName}, {RelatedEntity}, {EnumType} placeholders

using System.Collections.ObjectModel;

namespace Tidansu.Domain.Entities;

public class {EntityName}
{
    public Guid Id { get; set; }

    // Required string properties
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;

    // Timestamps
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime UpdatedAt { get; set; } = DateTime.Now;

    // Enum from Domain/Constants/
    // public {EnumType} Status { get; set; }

    // User ownership — include if this entity belongs to a user
    public string UserId { get; set; } = string.Empty;
    public User User { get; set; } = default!;

    // One-to-many relationship — include if needed
    // public ICollection<{RelatedEntity}> Items { get; set; } = new Collection<{RelatedEntity}>();
}
