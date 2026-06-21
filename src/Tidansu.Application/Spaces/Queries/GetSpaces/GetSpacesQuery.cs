using MediatR;
using Tidansu.Application.Spaces.Dtos;

namespace Tidansu.Application.Spaces.Queries.GetSpaces;

public class GetSpacesQuery : IRequest<List<SpaceDto>>;
